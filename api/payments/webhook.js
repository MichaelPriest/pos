import crypto from 'crypto';
import { decrypt } from '../admin/payment-settings.js';

export const config = { api: { bodyParser: false } };
const MAX_WEBHOOK_BYTES=1024*1024;
const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];let size=0;
  req.on('data', chunk => {size+=chunk.length;if(size>MAX_WEBHOOK_BYTES){const error=new Error('Webhook excede o limite de 1 MB');error.statusCode=413;reject(error);req.destroy();return}chunks.push(chunk)});
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

async function providerSecret(provider) {
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(base&&key){
    const response=await fetch(`${base}/rest/v1/integration_secrets?provider=eq.${encodeURIComponent(provider)}&select=encrypted_value`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
    if(response.ok){const rows=await response.json();if(rows[0]?.encrypted_value)return decrypt(rows[0].encrypted_value)}
  }
  return provider==='mercadopago'?process.env.MERCADOPAGO_ACCESS_TOKEN:provider==='pagbank'?process.env.PAGBANK_TOKEN:null;
}

async function eventStore(provider, eventId, payload, action, error = null, claimToken = null) {
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key||!eventId)throw new Error('Registro de webhook não configurado');
  const claim=action==='claim',response=await fetch(`${base}/rest/v1/rpc/${claim?'claim_webhook_event':'finish_webhook_event'}`,{
    method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify(claim?{p_provider:provider,p_event_id:String(eventId),p_payload:payload}:{p_provider:provider,p_event_id:String(eventId),p_claim_token:claimToken,p_success:action==='processed',p_error:error?String(error):null}),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(result?.message||'Falha ao registrar webhook');
  return result;
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
  let provider, payload, claimToken = null;
  try {
    provider = req.query.provider;
    const raw = await readBody(req);
    payload = JSON.parse(raw.toString('utf8') || '{}');
    let result;
    if (provider === 'stripe') {
      verifyStripeSignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
      claimToken = await eventStore(provider, payload.id, payload, 'claim');
      if (!claimToken) return res.status(200).json({ received:true, duplicate:true, event_id:payload.id });
      result = await stripeEvent(payload);
    } else if (provider === 'mercadopago') {
      const id = payload.data?.id || req.query['data.id'];
      if (!id) throw new Error('Pagamento Mercado Pago ausente');
      claimToken = await eventStore(provider, payload.id || String(id), payload, 'claim');
      if (!claimToken) return res.status(200).json({ received:true, duplicate:true, event_id:payload.id || String(id) });
      const secret=await providerSecret(provider);if(!secret)throw new Error('Mercado Pago não configurado');
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${secret}` } });
      const payment = await response.json();
      if (!response.ok) throw new Error('Notificação Mercado Pago inválida');
      await updateOrder(payment.external_reference, payment.status, payment.id);
      result = { processed: true };
    } else if (provider === 'pagbank') {
      claimToken = await eventStore(provider, payload.id, payload, 'claim');
      if (!claimToken) return res.status(200).json({ received:true, duplicate:true, event_id:payload.id });
      const secret=await providerSecret(provider);if(!secret)throw new Error('PagBank não configurado');
      const response=await fetch(`https://api.pagseguro.com/orders/${encodeURIComponent(payload.id)}`,{headers:{Authorization:`Bearer ${secret}`}}),payment=await response.json();
      if(!response.ok||!payment.reference_id)throw new Error('Notificação PagBank inválida');
      await updateOrder(payment.reference_id,payment.charges?.[0]?.status,payment.id);
      result = { processed: true };
    } else throw new Error('Provedor inválido');
    await eventStore(provider,payload.id||String(payload.data?.id||''),payload,'processed',null,claimToken);
    return res.status(200).json({ received: true, event_id: payload.id, ...result });
  } catch (error) {
    if(claimToken&&provider&&payload)await eventStore(provider,payload.id||String(payload.data?.id||''),payload,'failed',error.message,claimToken).catch(()=>{});
    return res.status(error.statusCode||400).json({ received: false, message: error.message });
  }
}
