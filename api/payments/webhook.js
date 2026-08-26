import crypto from 'node:crypto';
import { decrypt } from '../admin/payment-settings.js';
import { assertPaymentMatches, verifyMercadoPagoSignature } from '../../lib/server/payment-security.js';

export { verifyMercadoPagoSignature } from '../../lib/server/payment-security.js';
export const config = { api: { bodyParser: false } };

const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const mapStatus = status => ['approved', 'paid', 'PAID', 'complete'].includes(status)
  ? 'pago'
  : ['cancelled', 'canceled', 'rejected', 'DECLINED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'expired'].includes(status) ? 'cancelado' : 'pendente';

const supabaseContext = () => ({
  base: process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

export function verifyStripeSignature(raw, header, secret, now = Date.now()) {
  if (!secret || !header) throw Object.assign(new Error('Assinatura Stripe ausente'), { statusCode: 401 });
  const values = header.split(',').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return result;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    result[key] = [...(result[key] || []), value];
    return result;
  }, {});
  const timestamp = Number(values.t?.[0]);
  if (!timestamp || Math.abs(now / 1000 - timestamp) > 300) throw Object.assign(new Error('Assinatura Stripe expirada'), { statusCode: 401 });
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const valid = (values.v1 || []).some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  });
  if (!valid) throw Object.assign(new Error('Assinatura Stripe inválida'), { statusCode: 401 });
  return true;
}

async function providerSecret(provider) {
  const { base, key } = supabaseContext();
  if (!base || !key) throw Object.assign(new Error('Supabase não configurado'), { statusCode: 503 });
  const response = await fetch(`${base}/rest/v1/integration_secrets?provider=eq.${provider}&select=encrypted_value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const rows = await response.json();
  if (!response.ok) throw Object.assign(new Error('Não foi possível consultar a credencial do provedor'), { statusCode: 502 });
  const fallback = provider === 'mercadopago' ? process.env.MERCADOPAGO_ACCESS_TOKEN : process.env.PAGBANK_TOKEN;
  return rows[0]?.encrypted_value ? decrypt(rows[0].encrypted_value) : fallback;
}

async function orderForPayment(orderId) {
  const { base, key } = supabaseContext();
  if (!orderId || !base || !key) throw Object.assign(new Error('Pedido ou Supabase não configurado'), { statusCode: 503 });
  const response = await fetch(`${base}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,total,status,payment_provider`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const rows = await response.json();
  if (!response.ok) throw Object.assign(new Error('Não foi possível consultar o pedido'), { statusCode: 502 });
  if (!rows[0]) throw Object.assign(new Error('Pedido não encontrado'), { statusCode: 404 });
  return rows[0];
}

async function updateOrder(orderId, status, reference, payment) {
  const { base, key } = supabaseContext();
  const order = await orderForPayment(orderId);
  if (order.payment_provider !== payment.provider) throw Object.assign(new Error('O provedor não corresponde ao pedido'), { statusCode: 409 });
  assertPaymentMatches(order, payment.amount, payment.currency, { amountInCents: payment.amountInCents });
  const response = await fetch(`${base}/rest/v1/rpc/reconcile_order_payment`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_order_id: orderId, p_status: mapStatus(status), p_reference: String(reference || '') }),
  });
  if (!response.ok) throw Object.assign(new Error('Não foi possível conciliar o pedido'), { statusCode: 502 });
}

async function eventStore(provider, eventId, payload, action, error = null) {
  const { base, key } = supabaseContext();
  if (!base || !key || !eventId) throw Object.assign(new Error('Registro de webhook não configurado'), { statusCode: 503 });
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (action === 'claim') {
    const response = await fetch(`${base}/rest/v1/rpc/claim_webhook_event`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_provider: provider, p_event_id: eventId, p_payload: payload }),
    });
    const claimed = await response.json();
    if (!response.ok) throw Object.assign(new Error('Falha ao registrar webhook'), { statusCode: 502 });
    return claimed === true;
  }
  const updated = await fetch(`${base}/rest/v1/webhook_events?provider=eq.${encodeURIComponent(provider)}&event_id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(action === 'processed'
      ? { status: 'processed', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status: 'failed', last_error: String(error || 'Erro desconhecido'), updated_at: new Date().toISOString() }),
  });
  if (!updated.ok) throw Object.assign(new Error('Falha ao atualizar o webhook'), { statusCode: 502 });
  return true;
}

async function stripeEvent(payload) {
  const object = payload.data?.object || {};
  const payment = { provider: 'stripe', amount: object.amount_total, currency: object.currency, amountInCents: true };
  if (payload.type === 'checkout.session.completed' || payload.type === 'checkout.session.async_payment_succeeded') {
    await updateOrder(object.client_reference_id || object.metadata?.order_id, object.payment_status || 'paid', object.id, payment);
    return { processed: true };
  }
  if (payload.type === 'checkout.session.async_payment_failed' || payload.type === 'checkout.session.expired') {
    await updateOrder(object.client_reference_id || object.metadata?.order_id, 'canceled', object.id, payment);
    return { processed: true };
  }
  return { processed: false, reason: `Evento ${payload.type || 'desconhecido'} não altera pedidos` };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });
  let provider;
  let payload;
  let eventId;
  let claimed = false;
  try {
    provider = req.query.provider;
    const raw = await readBody(req);
    if (raw.length > 1024 * 1024) throw Object.assign(new Error('Webhook excede o limite de 1 MB'), { statusCode: 413 });
    payload = JSON.parse(raw.toString('utf8') || '{}');
    let result;
    if (provider === 'stripe') {
      verifyStripeSignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
      eventId = payload.id;
      claimed = await eventStore(provider, eventId, payload, 'claim');
      if (!claimed) return res.status(200).json({ received: true, duplicate: true, event_id: eventId });
      result = await stripeEvent(payload);
    } else if (provider === 'mercadopago') {
      const paymentId = String(payload.data?.id || req.query['data.id'] || '');
      if (!paymentId) throw new Error('Pagamento Mercado Pago ausente');
      verifyMercadoPagoSignature(req.headers['x-signature'], req.headers['x-request-id'], paymentId, process.env.MERCADOPAGO_WEBHOOK_SECRET);
      eventId = String(payload.id || paymentId);
      const secret = await providerSecret(provider);
      if (!secret) throw Object.assign(new Error('Credencial Mercado Pago não configurada'), { statusCode: 503 });
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${secret}` } });
      const payment = await response.json();
      if (!response.ok || String(payment.id) !== paymentId) throw new Error('Notificação Mercado Pago inválida');
      claimed = await eventStore(provider, eventId, payload, 'claim');
      if (!claimed) return res.status(200).json({ received: true, duplicate: true, event_id: eventId });
      await updateOrder(payment.external_reference, payment.status, payment.id, {
        provider,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
      });
      result = { processed: true };
    } else if (provider === 'pagbank') {
      if (!payload.id) throw new Error('Pedido PagBank ausente');
      const secret = await providerSecret(provider);
      if (!secret) throw Object.assign(new Error('Credencial PagBank não configurada'), { statusCode: 503 });
      const response = await fetch(`https://api.pagseguro.com/orders/${encodeURIComponent(payload.id)}`, { headers: { Authorization: `Bearer ${secret}` } });
      const verifiedOrder = await response.json();
      if (!response.ok || verifiedOrder.id !== payload.id) throw new Error('Notificação PagBank inválida');
      const charge = verifiedOrder.charges?.[0];
      eventId = `${verifiedOrder.id}:${charge?.id || 'order'}:${charge?.status || 'unknown'}`;
      claimed = await eventStore(provider, eventId, payload, 'claim');
      if (!claimed) return res.status(200).json({ received: true, duplicate: true, event_id: eventId });
      await updateOrder(verifiedOrder.reference_id, charge?.status, verifiedOrder.id, {
        provider,
        amount: charge?.amount?.value,
        currency: charge?.amount?.currency,
        amountInCents: true,
      });
      result = { processed: true };
    } else {
      throw new Error('Provedor inválido');
    }
    await eventStore(provider, eventId, payload, 'processed');
    return res.status(200).json({ received: true, event_id: eventId, ...result });
  } catch (error) {
    if (claimed && provider && payload && eventId) await eventStore(provider, eventId, payload, 'failed', error.message).catch(() => {});
    return res.status(error.statusCode || 400).json({ received: false, message: error.message });
  }
}
