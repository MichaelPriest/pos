import { decrypt } from '../admin/payment-settings.js';
import { enforceRateLimit } from '../../lib/server/rate-limit.js';
import { assertPaymentMatches, gatewayIdempotencyKey } from '../../lib/server/payment-security.js';

const providerEnvironmentSecret = provider => ({
  stripe: process.env.STRIPE_SECRET_KEY,
  mercadopago: process.env.MERCADOPAGO_ACCESS_TOKEN,
  pagbank: process.env.PAGBANK_TOKEN,
})[provider];

async function parse(response) {
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message || data.message || 'O provedor recusou o pagamento.'), { statusCode: 502 });
  return data;
}

const providers = {
  async stripe(order, origin, email, secret, store, idempotencyKey) {
    const body = buildStripeCheckoutBody(order, origin, email, store);
    const data = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body,
    }).then(parse);
    return { url: data.url, reference: data.id };
  },
  async mercadopago(order, origin, email, secret, _store, idempotencyKey) {
    const data = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        external_reference: order.id,
        items: [{ title: `Pedido ${order.id.slice(0, 8)}`, quantity: 1, currency_id: 'BRL', unit_price: Number(order.total) }],
        payer: { email },
        back_urls: {
          success: `${origin}/minha-conta?pagamento=sucesso`,
          failure: `${origin}/loja?pagamento=falhou`,
          pending: `${origin}/minha-conta`,
        },
        auto_return: 'approved',
        notification_url: `${origin}/api/payments/webhook?provider=mercadopago`,
      }),
    }).then(parse);
    return { url: data.init_point, reference: data.id };
  },
  async pagbank(order, origin, _email, secret, _store, idempotencyKey) {
    const data = await fetch('https://api.pagseguro.com/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        reference_id: order.id,
        items: [{ reference_id: order.id, name: `Pedido ${order.id.slice(0, 8)}`, quantity: 1, unit_amount: Math.round(Number(order.total) * 100) }],
        charges: [{
          reference_id: order.id,
          description: 'Compra ReVeste',
          amount: { value: Math.round(Number(order.total) * 100), currency: 'BRL' },
          payment_method: { type: 'PIX', pix: { expiration_date: new Date(Date.now() + 86400000).toISOString() } },
        }],
        notification_urls: [`${origin}/api/payments/webhook?provider=pagbank`],
      }),
    }).then(parse);
    return {
      qr_code: data.qr_codes?.[0]?.text,
      qr_image: data.qr_codes?.[0]?.links?.find(link => link.media === 'image/png')?.href,
      reference: data.id,
    };
  },
};

export function buildStripeCheckoutBody(order, origin, email, store = {}) {
  const name = store.store_name || 'ReVeste';
  const code = order.id.slice(0, 8).toUpperCase();
  return new URLSearchParams({
    mode: 'payment',
    locale: 'pt-BR',
    expires_at: String(Math.floor(Date.now() / 1000) + 1800),
    success_url: `${origin}/minha-conta?pagamento=verificar&pedido=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout?pagamento=cancelado`,
    client_reference_id: order.id,
    customer_email: email || '',
    customer_creation: 'always',
    'payment_method_types[0]': 'card',
    'payment_intent_data[metadata][order_id]': order.id,
    'metadata[order_id]': order.id,
    'line_items[0][price_data][currency]': 'brl',
    'line_items[0][price_data][product_data][name]': `${name} · Pedido #${code}`,
    'line_items[0][price_data][product_data][description]': 'Compra segura de peças selecionadas e revisadas.',
    'line_items[0][price_data][unit_amount]': String(Math.round(Number(order.total) * 100)),
    'line_items[0][quantity]': '1',
    'custom_text[submit][message]': `Você receberá a confirmação e o rastreio do pedido #${code} por e-mail.`,
  });
}

async function providerSecret(provider, base, service) {
  const response = await fetch(`${base}/rest/v1/integration_secrets?provider=eq.${provider}&select=encrypted_value`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  const rows = await response.json();
  if (!response.ok) throw Object.assign(new Error('Não foi possível consultar a credencial do provedor.'), { statusCode: 502 });
  return rows[0]?.encrypted_value ? decrypt(rows[0].encrypted_value) : providerEnvironmentSecret(provider);
}

export function providerEnabled(provider, paymentMethod, settings = {}) {
  const method = String(paymentMethod || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (provider === 'stripe') return settings.stripe_enabled === true && settings.card_enabled === true && method === 'cartao';
  if (provider === 'pagbank') return settings.pagbank_enabled === true && settings.pix_enabled === true && method === 'pix';
  if (provider === 'mercadopago') {
    const methodEnabled = method === 'pix' ? settings.pix_enabled === true : method === 'cartao' && settings.card_enabled === true;
    return settings.mercadopago_enabled === true && methodEnabled;
  }
  return false;
}

export async function resumeExisting(order, provider, secret) {
  if (!order.payment_reference) return null;
  if (provider === 'stripe') {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.payment_reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error('Não foi possível consultar a cobrança Stripe.'), { statusCode: 502 });
    if (data.client_reference_id !== order.id) throw Object.assign(new Error('A cobrança Stripe não corresponde ao pedido.'), { statusCode: 409 });
    assertPaymentMatches(order, data.amount_total, data.currency, { amountInCents: true });
    if (data.status === 'open' && data.url) return { url: data.url, reference: data.id, resumed: true };
    if (data.status === 'expired') return { expired: true, reference: data.id };
    if (data.status === 'complete') return { completed: true, reference: data.id, resumed: true };
    return null;
  }
  if (provider === 'mercadopago') {
    const response = await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(order.payment_reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error('Não foi possível consultar a cobrança Mercado Pago.'), { statusCode: 502 });
    if (String(data.external_reference) !== order.id) throw Object.assign(new Error('A cobrança Mercado Pago não corresponde ao pedido.'), { statusCode: 409 });
    const preferenceTotal = data.items?.reduce((total, item) => total + Number(item.unit_price) * Number(item.quantity), 0);
    assertPaymentMatches(order, preferenceTotal, data.items?.[0]?.currency_id);
    return (data.init_point || data.sandbox_init_point) ? { url: data.init_point || data.sandbox_init_point, reference: data.id, resumed: true } : null;
  }
  if (provider === 'pagbank') {
    const response = await fetch(`https://api.pagseguro.com/orders/${encodeURIComponent(order.payment_reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error('Não foi possível consultar a cobrança PagBank.'), { statusCode: 502 });
    if (data.reference_id !== order.id) throw Object.assign(new Error('A cobrança PagBank não corresponde ao pedido.'), { statusCode: 409 });
    const charge = data.charges?.[0];
    assertPaymentMatches(order, charge?.amount?.value, charge?.amount?.currency, { amountInCents: true });
    if (data.qr_codes?.[0]) return {
      qr_code: data.qr_codes[0].text,
      qr_image: data.qr_codes[0].links?.find(link => link.media === 'image/png')?.href,
      reference: data.id,
      resumed: true,
    };
    const chargeStatus = charge?.status;
    if (['DECLINED', 'CANCELED', 'CANCELLED', 'EXPIRED'].includes(chargeStatus)) return { expired: true, reference: data.id };
    if (chargeStatus === 'PAID') return { completed: true, reference: data.id, resumed: true };
    return null;
  }
  return null;
}

export function normalizeOrderId(value) {
  const candidate = Array.isArray(value) ? value[0]?.id || value[0] : value?.id || value;
  return typeof candidate === 'string' ? candidate.replace(/^"|"$/g, '').trim() : '';
}

export function paymentOrigin(req) {
  const configured = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  if (configured) {
    const url = new URL(configured);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) throw Object.assign(new Error('SITE_URL deve usar HTTPS.'), { statusCode: 503 });
    return url.origin;
  }
  if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('SITE_URL não configurada.'), { statusCode: 503 });
  return `http://${req.headers.host || 'localhost:3000'}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });
  try {
    const orderId = normalizeOrderId(req.body?.order_id);
    const provider = req.body?.provider;
    const supabase = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!supabase || !anon || !service) return res.status(503).json({ message: 'Integração com o Supabase incompleta na Vercel.' });
    await enforceRateLimit(req, res, { base: supabase, service, scope: 'payment-create', limit: 10, windowSeconds: 60 });
    if (!token || !providers[provider] || !orderId) return res.status(400).json({ message: 'Pagamento inválido.' });

    const userResponse = await fetch(`${supabase}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return res.status(401).json({ message: 'Sessão expirada.' });
    const user = await userResponse.json();
    const orderResponse = await fetch(`${supabase}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&customer_id=eq.${encodeURIComponent(user.id)}&select=*`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
    const orders = await orderResponse.json();
    if (!orderResponse.ok) return res.status(502).json({ message: orders?.message || 'Não foi possível consultar o pedido no Supabase.' });
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order) return res.status(404).json({ message: `Pedido ${orderId.slice(0, 8)} não encontrado para esta conta.` });
    if (order.status !== 'pendente') return res.status(409).json({ message: 'Este pedido não está pendente de pagamento.' });

    const settingsResponse = await fetch(`${supabase}/rest/v1/store_settings?id=eq.1&select=store_name,logo_url,stripe_enabled,mercadopago_enabled,pagbank_enabled,pix_enabled,card_enabled`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
    const storeRows = await settingsResponse.json();
    if (!settingsResponse.ok || !storeRows[0]) return res.status(503).json({ message: 'Configuração de pagamento indisponível.' });
    if (!providerEnabled(provider, order.payment_method, storeRows[0])) return res.status(409).json({ message: 'Esta forma de pagamento não está habilitada para o provedor escolhido.' });
    if (order.payment_provider && order.payment_provider !== provider) return res.status(409).json({ message: 'Este pedido já está vinculado a outro provedor.' });

    const secret = await providerSecret(provider, supabase, service);
    if (!secret) return res.status(503).json({ message: 'Credencial do provedor não configurada.' });
    if (order.payment_reference) {
      const resumed = await resumeExisting(order, provider, secret);
      if (resumed?.expired) {
        const cancellation = await fetch(`${supabase}/rest/v1/rpc/reconcile_order_payment`, {
          method: 'POST',
          headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_order_id: order.id, p_status: 'cancelado', p_reference: String(resumed.reference || order.payment_reference) }),
        });
        if (!cancellation.ok) throw Object.assign(new Error('A cobrança expirou, mas não foi possível liberar a reserva.'), { statusCode: 502 });
        return res.status(409).json({ code: 'payment_expired', message: 'A cobrança expirou e a reserva foi liberada. Clique novamente para criar um novo pedido.' });
      }
      if (resumed) return res.status(200).json(resumed);
      return res.status(409).json({ message: 'A cobrança anterior expirou. Cancele este pedido e refaça a compra para reservar o estoque novamente.' });
    }

    const origin = paymentOrigin(req);
    const payment = await providers[provider](order, origin, user.email, secret, storeRows[0], gatewayIdempotencyKey(order.id, provider));
    const saveResponse = await fetch(`${supabase}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&status=eq.pendente`, {
      method: 'PATCH',
      headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ payment_provider: provider, payment_reference: payment.reference }),
    });
    const saved = await saveResponse.json();
    if (!saveResponse.ok || !Array.isArray(saved) || !saved[0]) throw Object.assign(new Error('A cobrança foi criada, mas não foi possível vinculá-la ao pedido. Tente novamente.'), { statusCode: 502 });
    return res.status(200).json(payment);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
}
