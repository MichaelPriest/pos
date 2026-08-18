const providers = {
  async stripe(order, origin) {
    const body = new URLSearchParams({ mode:'payment', success_url:`${origin}/minha-conta?pagamento=sucesso`, cancel_url:`${origin}/loja?pagamento=cancelado`, client_reference_id:order.id, 'line_items[0][price_data][currency]':'brl', 'line_items[0][price_data][product_data][name]':`Pedido ${order.id.slice(0,8)}`, 'line_items[0][price_data][unit_amount]':String(Math.round(Number(order.total)*100)), 'line_items[0][quantity]':'1' });
    return fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body}).then(parse).then(data=>({url:data.url,reference:data.id}));
  },
  async mercadopago(order, origin, email) {
    return fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({external_reference:order.id,items:[{title:`Pedido ${order.id.slice(0,8)}`,quantity:1,currency_id:'BRL',unit_price:Number(order.total)}],payer:{email},back_urls:{success:`${origin}/minha-conta?pagamento=sucesso`,failure:`${origin}/loja?pagamento=falhou`,pending:`${origin}/minha-conta`},auto_return:'approved',notification_url:`${origin}/api/payments/webhook?provider=mercadopago`})}).then(parse).then(data=>({url:data.init_point,reference:data.id}));
  },
  async pagbank(order, origin) {
    return fetch('https://api.pagseguro.com/orders',{method:'POST',headers:{Authorization:`Bearer ${process.env.PAGBANK_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({reference_id:order.id,items:[{reference_id:order.id,name:`Pedido ${order.id.slice(0,8)}`,quantity:1,unit_amount:Math.round(Number(order.total)*100)}],charges:[{reference_id:order.id,description:'Compra ReVeste',amount:{value:Math.round(Number(order.total)*100),currency:'BRL'},payment_method:{type:'PIX',pix:{expiration_date:new Date(Date.now()+86400000).toISOString()}}}],notification_urls:[`${origin}/api/payments/webhook?provider=pagbank`]})}).then(parse).then(data=>({qr_code:data.qr_codes?.[0]?.text,qr_image:data.qr_codes?.[0]?.links?.find(link=>link.media==='image/png')?.href,reference:data.id}));
  }
};
async function parse(response){const data=await response.json();if(!response.ok)throw new Error(data.error?.message||data.message||'O provedor recusou o pagamento.');return data;}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  try{
    const {order_id,provider}=req.body; const supabase=process.env.NEXT_PUBLIC_SUPABASE_URL; const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const service=process.env.SUPABASE_SERVICE_ROLE_KEY; const token=req.headers.authorization?.replace('Bearer ','');
    if(!token||!providers[provider])return res.status(400).json({message:'Pagamento inválido.'});
    const userResponse=await fetch(`${supabase}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});if(!userResponse.ok)return res.status(401).json({message:'Sessão expirada.'});const user=await userResponse.json();
    const orderResponse=await fetch(`${supabase}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}&customer_id=eq.${user.id}&select=*`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});const orders=await orderResponse.json();if(!orders[0])return res.status(404).json({message:'Pedido não encontrado.'});
    const origin=process.env.NEXT_PUBLIC_SITE_URL||`https://${req.headers.host}`;const payment=await providers[provider](orders[0],origin,user.email);
    await fetch(`${supabase}/rest/v1/orders?id=eq.${order_id}`,{method:'PATCH',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({payment_provider:provider,payment_reference:payment.reference})});
    return res.status(200).json(payment);
  }catch(error){return res.status(500).json({message:error.message});}
}
