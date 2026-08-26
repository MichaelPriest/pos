import { decrypt } from '../admin/payment-settings.js';
import { enforceRateLimit } from '../../lib/server/rate-limit.js';
import { assertPaymentMatches } from '../../lib/server/payment-security.js';

const paidStatuses = new Set(['paid', 'approved', 'PAID']);
const failedStatuses = new Set(['unpaid', 'canceled', 'cancelled', 'rejected', 'DECLINED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'expired']);
export const orderStatusForPayment = status => paidStatuses.has(status) ? 'pago' : failedStatuses.has(status) ? 'cancelado' : 'pendente';

const providerEnvironmentSecret = provider => ({
  stripe: process.env.STRIPE_SECRET_KEY,
  mercadopago: process.env.MERCADOPAGO_ACCESS_TOKEN,
  pagbank: process.env.PAGBANK_TOKEN,
})[provider];

async function secretFor(provider, base, service) {
  const response = await fetch(`${base}/rest/v1/integration_secrets?provider=eq.${provider}&select=encrypted_value`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
  const rows = await response.json();
  if (!response.ok) throw Object.assign(new Error('Não foi possível consultar a credencial do provedor.'), { statusCode: 502 });
  return rows[0]?.encrypted_value ? decrypt(rows[0].encrypted_value) : providerEnvironmentSecret(provider);
}

export async function providerStatus(order, sessionId, base, service) {
  const secret = await secretFor(order.payment_provider, base, service);
  if (!secret) throw Object.assign(new Error('Credencial do provedor não configurada.'), { statusCode: 503 });
  if (order.payment_provider === 'stripe') {
    const reference = sessionId || order.payment_reference;
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await response.json();
    if (!response.ok || data.client_reference_id !== order.id) throw new Error('Sessão Stripe inválida para este pedido.');
    assertPaymentMatches(order, data.amount_total, data.currency, { amountInCents: true });
    return { status: data.payment_status, reference: data.id };
  }
  if (order.payment_provider === 'mercadopago') {
    const params = new URLSearchParams({ sort: 'date_created', criteria: 'desc', external_reference: order.id });
    const response = await fetch(`https://api.mercadopago.com/v1/payments/search?${params}`, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await response.json();
    if (!response.ok) throw new Error('Não foi possível consultar o pagamento Mercado Pago.');
    const payment = data.results?.find(item => String(item.external_reference) === order.id);
    if (!payment) return { status: 'pending', reference: order.payment_reference };
    assertPaymentMatches(order, payment.transaction_amount, payment.currency_id);
    return { status: payment.status, reference: payment.id };
  }
  if (order.payment_provider === 'pagbank') {
    const response = await fetch(`https://api.pagseguro.com/orders/${encodeURIComponent(order.payment_reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await response.json();
    if (!response.ok || data.reference_id !== order.id) throw new Error('Pagamento PagBank inválido para este pedido.');
    const charge = data.charges?.[0];
    assertPaymentMatches(order, charge?.amount?.value, charge?.amount?.currency, { amountInCents: true });
    return { status: charge?.status, reference: data.id };
  }
  return { status: 'pending', reference: order.payment_reference };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });
  try {
    const base = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!base || !anon || !service) return res.status(503).json({ message: 'Supabase não configurado.' });
    if (!token) return res.status(401).json({ message: 'Sessão expirada.' });
    await enforceRateLimit(req, res, { base, service, scope: 'payment-status', limit: 30, windowSeconds: 60 });
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return res.status(401).json({ message: 'Sessão expirada.' });
    const user = await userResponse.json();
    const orderId = String(req.body?.order_id || '');
    const profileResponse = await fetch(`${base}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
    const profiles = await profileResponse.json();
    const isStaff = ['admin', 'manager'].includes(profiles[0]?.role);
    const ownerFilter = isStaff ? '' : `&customer_id=eq.${user.id}`;
    const orderResponse = await fetch(`${base}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}${ownerFilter}&select=*`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
    const orders = await orderResponse.json();
    const order = orders[0];
    if (!orderResponse.ok) return res.status(502).json({ message: 'Não foi possível consultar o pedido.' });
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado ou acesso não autorizado.' });
    if (order.status !== 'pendente') return res.json({ verified: true, status: order.status });
    const payment = await providerStatus(order, req.body?.session_id, base, service);
    const status = orderStatusForPayment(payment.status);
    if (status !== 'pendente') {
      const reconciliation = await fetch(`${base}/rest/v1/rpc/reconcile_order_payment`, {
        method: 'POST',
        headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: order.id, p_status: status, p_reference: String(payment.reference || '') }),
      });
      if (!reconciliation.ok) throw Object.assign(new Error('Não foi possível conciliar o pedido.'), { statusCode: 502 });
    }
    return res.json({ verified: true, status, paid: status === 'pago' });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message });
  }
}
