import { decrypt } from '../admin/payment-settings.js';

const paidStatuses = new Set(['paid', 'approved', 'PAID']);
const failedStatuses = new Set(['unpaid', 'canceled', 'cancelled', 'rejected', 'DECLINED', 'expired']);
export const orderStatusForPayment = status => paidStatuses.has(status) ? 'pago' : failedStatuses.has(status) ? 'cancelado' : 'pendente';

async function secretFor(provider, base, service) {
  const response = await fetch(`${base}/rest/v1/integration_secrets?provider=eq.${provider}&select=encrypted_value`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
  const rows = await response.json();
  return rows[0]?.encrypted_value ? decrypt(rows[0].encrypted_value) : null;
}

async function providerStatus(order, sessionId, base, service) {
  const secret = await secretFor(order.payment_provider, base, service);
  if (order.payment_provider === 'stripe') {
    const reference = sessionId || order.payment_reference;
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret || process.env.STRIPE_SECRET_KEY}` } });
    const data = await response.json();
    if (!response.ok || data.client_reference_id !== order.id) throw new Error('Sessão Stripe inválida para este pedido.');
    return { status: data.payment_status, reference: data.id };
  }
  if (order.payment_provider === 'mercadopago') {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(order.payment_reference)}`, { headers: { Authorization: `Bearer ${secret || process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
    const data = await response.json();
    if (!response.ok || String(data.external_reference) !== order.id) throw new Error('Pagamento Mercado Pago inválido para este pedido.');
    return { status: data.status, reference: data.id };
  }
  if (order.payment_provider === 'pagbank') {
    const response = await fetch(`https://api.pagseguro.com/orders/${encodeURIComponent(order.payment_reference)}`, { headers: { Authorization: `Bearer ${secret || process.env.PAGBANK_TOKEN}` } });
    const data = await response.json();
    if (!response.ok || data.reference_id !== order.id) throw new Error('Pagamento PagBank inválido para este pedido.');
    return { status: data.charges?.[0]?.status, reference: data.id };
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
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return res.status(401).json({ message: 'Sessão expirada.' });
    const user = await userResponse.json(), orderId = String(req.body?.order_id || '');
    const profileResponse = await fetch(`${base}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
    const profiles = await profileResponse.json(), isStaff = ['admin','manager'].includes(profiles[0]?.role);
    const ownerFilter = isStaff ? '' : `&customer_id=eq.${user.id}`;
    const orderResponse = await fetch(`${base}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}${ownerFilter}&select=*`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
    const orders = await orderResponse.json(), order = orders[0];
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado ou acesso não autorizado.' });
    if (order.status !== 'pendente') return res.json({ verified: true, status: order.status });
    const payment = await providerStatus(order, req.body?.session_id, base, service);
    const status = orderStatusForPayment(payment.status);
    if (status !== 'pendente') await fetch(`${base}/rest/v1/rpc/reconcile_order_payment`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type':'application/json' }, body:JSON.stringify({ p_order_id:order.id, p_status:status, p_reference:String(payment.reference||'') }) });
    return res.json({ verified: true, status, paid: status === 'pago' });
  } catch (error) { return res.status(400).json({ message: error.message }); }
}
