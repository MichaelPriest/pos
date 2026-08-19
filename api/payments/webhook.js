import crypto from 'crypto';

export const config = { api: { bodyParser: false } };
const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const mapStatus = status => ['approved', 'paid', 'PAID', 'complete'].includes(status)
  ? 'pago'
  : ['cancelled', 'canceled', 'rejected', 'DECLINED', 'expired'].includes(status) ? 'cancelado' : 'pendente';

export function verifyStripeSignature(raw, header, secret, now = Date.now()) {
  if (!secret || !header) throw new Error('Assinatura Stripe ausente');
  const values = header.split(',').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return result;
    const key = part.slice(0, separator), value = part.slice(separator + 1);
    result[key] = [...(result[key] || []), value];
    return result;
  }, {});
  const timestamp = Number(values.t?.[0]);
  if (!timestamp || Math.abs(now / 1000 - timestamp) > 300) throw new Error('Assinatura Stripe expirada');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
  const valid = (values.v1 || []).some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  });
  if (!valid) throw new Error('Assinatura Stripe inválida');
}

async function updateOrder(orderId, status, reference) {
  const base = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!orderId || !base || !key) throw new Error('Pedido ou Supabase não configurado');
  const response = await fetch(`${base}/rest/v1/rpc/reconcile_order_payment`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_order_id: orderId, p_status: mapStatus(status), p_reference: String(reference || '') }),
  });
  if (!response.ok) throw new Error('Não foi possível conciliar o pedido');
}

async function eventStore(provider, eventId, payload, action, error = null) {
  const base = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !eventId) throw new Error('Registro de webhook não configurado');
  const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' };
  if (action === 'claim') {
    const existingResponse = await fetch(`${base}/rest/v1/webhook_events?provider=eq.${encodeURIComponent(provider)}&event_id=eq.${encodeURIComponent(eventId)}&select=id,status,attempts`, { headers });
    const existing = (await existingResponse.json())[0];
    if (existing?.status === 'processed' || existing?.status === 'processing') return false;
    if (existing) { await fetch(`${base}/rest/v1/webhook_events?id=eq.${existing.id}`, { method:'PATCH', headers, body:JSON.stringify({ status:'processing', attempts:Number(existing.attempts)+1, last_error:null }) }); return true; }
    const created = await fetch(`${base}/rest/v1/webhook_events`, { method:'POST', headers, body:JSON.stringify({ provider, event_id:eventId, payload }) });
    if (!created.ok && created.status === 409) return false;
    if (!created.ok) throw new Error('Falha ao registrar webhook');
    return true;
  }
  await fetch(`${base}/rest/v1/webhook_events?provider=eq.${encodeURIComponent(provider)}&event_id=eq.${encodeURIComponent(eventId)}`, { method:'PATCH', headers, body:JSON.stringify(action === 'processed' ? { status:'processed', processed_at:new Date().toISOString() } : { status:'failed', last_error:String(error || 'Erro desconhecido') }) });
  return true;
}

async function stripeEvent(payload) {
  const object = payload.data?.object || {};
  if (payload.type === 'checkout.session.completed' || payload.type === 'checkout.session.async_payment_succeeded') {
    await updateOrder(object.client_reference_id || object.metadata?.order_id, object.payment_status || 'paid', object.id);
    return { processed: true };
  }
  if (payload.type === 'checkout.session.async_payment_failed' || payload.type === 'checkout.session.expired') {
    await updateOrder(object.client_reference_id || object.metadata?.order_id, 'canceled', object.id);
    return { processed: true };
  }
  // setup_intent.* apenas prepara/salva um meio de pagamento; não representa uma venda paga.
  return { processed: false, reason: `Evento ${payload.type || 'desconhecido'} não altera pedidos` };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });
  let provider, payload, claimed = false;
  try {
    provider = req.query.provider;
    const raw = await readBody(req);
    payload = JSON.parse(raw.toString('utf8') || '{}');
    let result;
    if (provider === 'stripe') {
      verifyStripeSignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
      claimed = await eventStore(provider, payload.id, payload, 'claim');
      if (!claimed) return res.status(200).json({ received:true, duplicate:true, event_id:payload.id });
      result = await stripeEvent(payload);
    } else if (provider === 'mercadopago') {
      const id = payload.data?.id || req.query['data.id'];
      if (!id) throw new Error('Pagamento Mercado Pago ausente');
      claimed = await eventStore(provider, payload.id || String(id), payload, 'claim');
      if (!claimed) return res.status(200).json({ received:true, duplicate:true, event_id:payload.id || String(id) });
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
      const payment = await response.json();
      if (!response.ok) throw new Error('Notificação Mercado Pago inválida');
      await updateOrder(payment.external_reference, payment.status, payment.id);
      result = { processed: true };
    } else if (provider === 'pagbank') {
      claimed = await eventStore(provider, payload.id, payload, 'claim');
      if (!claimed) return res.status(200).json({ received:true, duplicate:true, event_id:payload.id });
      await updateOrder(payload.reference_id, payload.charges?.[0]?.status, payload.id);
      result = { processed: true };
    } else throw new Error('Provedor inválido');
    await eventStore(provider, payload.id || String(payload.data?.id || ''), payload, 'processed');
    return res.status(200).json({ received: true, event_id: payload.id, ...result });
  } catch (error) {
    if (claimed && provider && payload) await eventStore(provider, payload.id || String(payload.data?.id || ''), payload, 'failed', error.message).catch(() => {});
    return res.status(400).json({ received: false, message: error.message });
  }
}
