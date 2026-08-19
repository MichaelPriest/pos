import { decrypt } from '../admin/payment-settings.js';
const providers = {
  async stripe(order, origin, email, secret, store) {
    const body = buildStripeCheckoutBody(order, origin, email, store);
    return fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${secret||process.env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body}).then(parse).then(data=>({url:data.url,reference:data.id}));
  },
  async mercadopago(order, origin, email, secret) {
    return fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${secret||process.env.MERCADOPAGO_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({external_reference:order.id,items:[{title:`Pedido ${order.id.slice(0,8)}`,quantity:1,currency_id:'BRL',unit_price:Number(order.total)}],payer:{email},back_urls:{success:`${origin}/minha-conta?pagamento=sucesso`,failure:`${origin}/loja?pagamento=falhou`,pending:`${origin}/minha-conta`},auto_return:'approved',notification_url:`${origin}/api/payments/webhook?provider=mercadopago`})}).then(parse).then(data=>({url:data.init_point,reference:data.id}));
  },
  async pagbank(order, origin, email, secret) {
    return fetch('https://api.pagseguro.com/orders',{method:'POST',headers:{Authorization:`Bearer ${secret||process.env.PAGBANK_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({reference_id:order.id,items:[{reference_id:order.id,name:`Pedido ${order.id.slice(0,8)}`,quantity:1,unit_amount:Math.round(Number(order.total)*100)}],charges:[{reference_id:order.id,description:'Compra ReVeste',amount:{value:Math.round(Number(order.total)*100),currency:'BRL'},payment_method:{type:'PIX',pix:{expiration_date:new Date(Date.now()+86400000).toISOString()}}}],notification_urls:[`${origin}/api/payments/webhook?provider=pagbank`]})}).then(parse).then(data=>({qr_code:data.qr_codes?.[0]?.text,qr_image:data.qr_codes?.[0]?.links?.find(link=>link.media==='image/png')?.href,reference:data.id}));
  }
};
export function buildStripeCheckoutBody(order,origin,email,store={}){const name=store.store_name||'ReVeste',code=order.id.slice(0,8).toUpperCase();return new URLSearchParams({mode:'payment',locale:'pt-BR',expires_at:String(Math.floor(Date.now()/1000)+1800),success_url:`${origin}/minha-conta?pagamento=verificar&pedido=${order.id}&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/checkout?pagamento=cancelado`,client_reference_id:order.id,customer_email:email||'',customer_creation:'always','payment_method_types[0]':'card','payment_intent_data[metadata][order_id]':order.id,'metadata[order_id]':order.id,'line_items[0][price_data][currency]':'brl','line_items[0][price_data][product_data][name]':`${name} · Pedido #${code}`,'line_items[0][price_data][product_data][description]':'Compra segura de peças selecionadas e revisadas.','line_items[0][price_data][unit_amount]':String(Math.round(Number(order.total)*100)),'line_items[0][quantity]':'1','custom_text[submit][message]':`Você receberá a confirmação e o rastreio do pedido #${code} por e-mail.`});}
async function parse(response){const data=await response.json();if(!response.ok)throw new Error(data.error?.message||data.message||'O provedor recusou o pagamento.');return data;}
async function providerSecret(provider,base,service){const response=await fetch(`${base}/rest/v1/integration_secrets?provider=eq.${provider}&select=encrypted_value`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),rows=await response.json();return rows[0]?.encrypted_value?decrypt(rows[0].encrypted_value):null;}
export function normalizeOrderId(value){const candidate=Array.isArray(value)?value[0]?.id||value[0]:value?.id||value;return typeof candidate==='string'?candidate.replace(/^"|"$/g,'').trim():'';}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  try{
    const order_id=normalizeOrderId(req.body?.order_id);
    const provider=req.body?.provider; const supabase=(process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL); const anon=(process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); const service=process.env.SUPABASE_SERVICE_ROLE_KEY; const token=req.headers.authorization?.replace('Bearer ','');
    if(!supabase||!anon||!service)return res.status(503).json({message:'Integração com o Supabase incompleta na Vercel.'});
    if(!token||!providers[provider]||!order_id)return res.status(400).json({message:'Pagamento inválido.'});
    const userResponse=await fetch(`${supabase}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});if(!userResponse.ok)return res.status(401).json({message:'Sessão expirada.'});const user=await userResponse.json();
    const orderResponse=await fetch(`${supabase}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}&customer_id=eq.${encodeURIComponent(user.id)}&select=*`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});const orders=await orderResponse.json();
    if(!orderResponse.ok)return res.status(502).json({message:orders?.message||'Não foi possível consultar o pedido no Supabase.'});
    if(!Array.isArray(orders)||!orders[0])return res.status(404).json({message:`Pedido ${order_id.slice(0,8)} não encontrado para esta conta.`});
    const settingsResponse=await fetch(`${supabase}/rest/v1/store_settings?id=eq.1&select=store_name,logo_url`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});const storeRows=settingsResponse.ok?await settingsResponse.json():[];
    const secret=await providerSecret(provider,supabase,service);const origin=process.env.SITE_URL||`https://${req.headers.host}`;const payment=await providers[provider](orders[0],origin,user.email,secret,storeRows[0]||{});
    await fetch(`${supabase}/rest/v1/orders?id=eq.${order_id}`,{method:'PATCH',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({payment_provider:provider,payment_reference:payment.reference})});
    return res.status(200).json(payment);
  }catch(error){return res.status(500).json({message:error.message});}
}
