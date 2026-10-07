import { decrypt } from '../admin/payment-settings.js';
import { enforceRateLimit } from '../../lib/server/rate-limit.js';

const digits=value=>String(value||'').replace(/\D/g,'');
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;

async function parse(response){
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.message||data.error||'O Melhor Envio recusou a cotação.'),{statusCode:response.status>=500?502:409});
  return data;
}

async function context(req,res){
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!base||!anon||!service)throw Object.assign(new Error('Supabase não configurado.'),{statusCode:503});
  await enforceRateLimit(req,res,{base,service,scope:'melhor-envio',limit:30,windowSeconds:300});
  if(!token)throw Object.assign(new Error('Sessão ausente.'),{statusCode:401});
  const userRes=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token}});
  if(!userRes.ok)throw Object.assign(new Error('Sessão expirada.'),{statusCode:401});
  const user=await userRes.json();
  const profileRes=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role',{headers:{apikey:service,Authorization:'Bearer '+service}});
  const profiles=profileRes.ok?await profileRes.json():[];
  if(!['admin','manager'].includes(profiles[0]?.role))throw Object.assign(new Error('Conta sem permissão para operar logística.'),{statusCode:403});
  return{base,service};
}

async function load(base,service,orderId){
  const headers={apikey:service,Authorization:'Bearer '+service};
  const orderRes=await fetch(base+'/rest/v1/orders?id=eq.'+encodeURIComponent(orderId)+'&select=id,status,shipping_service,shipping_address,subtotal,discount&limit=1',{headers});
  const orders=await orderRes.json();
  if(!orderRes.ok)throw new Error(orders?.message||'Não foi possível consultar o pedido.');
  const settingsRes=await fetch(base+'/rest/v1/store_settings?id=eq.1&select=shipping_origin_email,support_email,shipping_origin_zip_code,shipping_package_width,shipping_package_height,shipping_package_length,shipping_package_weight,melhorenvio_sandbox&limit=1',{headers});
  const settingsRows=settingsRes.ok?await settingsRes.json():[];
  return{order:orders[0],settings:settingsRows[0]||{}};
}

async function secret(base,service){
  const response=await fetch(base+'/rest/v1/integration_secrets?provider=eq.melhorenvio&select=encrypted_value',{headers:{apikey:service,Authorization:'Bearer '+service}});
  const rows=response.ok?await response.json():[];
  return rows[0]?.encrypted_value?decrypt(rows[0].encrypted_value):'';
}

function payload(order,settings){
  const from=digits(settings.shipping_origin_zip_code),to=digits(order?.shipping_address?.zip_code);
  if(from.length!==8)throw Object.assign(new Error('Configure um CEP de origem válido em Integrações.'),{statusCode:409});
  if(to.length!==8)throw Object.assign(new Error('Pedido sem CEP de destino válido.'),{statusCode:409});
  const volume={width:Number(settings.shipping_package_width),height:Number(settings.shipping_package_height),length:Number(settings.shipping_package_length),weight:Number(settings.shipping_package_weight)};
  if(!Object.values(volume).every(positive))throw Object.assign(new Error('Configure largura, altura, comprimento e peso padrão do pacote em Integrações.'),{statusCode:409});
  return{from:{postal_code:from},to:{postal_code:to},volumes:[volume],options:{insurance_value:Math.max(0,Number(order.subtotal||0)-Number(order.discount||0)),receipt:false,own_hand:false}};
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  try{
    const orderId=String(req.body?.order_id||'').trim();
    if(!orderId)return res.status(400).json({message:'Pedido obrigatório.'});
    const{base,service}=await context(req,res),{order,settings}=await load(base,service,orderId);
    if(!order)return res.status(404).json({message:'Pedido não encontrado.'});
    if(order.shipping_service==='Retirada na loja')return res.status(409).json({message:'Pedido marcado para retirada na loja.'});
    if(!['pago','separando','enviado'].includes(order.status))return res.status(409).json({message:'Somente pedidos pagos podem ser cotados.'});
    const token=await secret(base,service);
    if(!token)return res.status(409).json({message:'Configure o token do Melhor Envio em Integrações.'});
    const sandbox=settings.melhorenvio_sandbox!==false;
    const url=(sandbox?'https://sandbox.melhorenvio.com.br':'https://www.melhorenvio.com.br')+'/api/v2/me/shipment/calculate';
    const email=String(settings.shipping_origin_email||settings.support_email||'').trim();
    if(!email)return res.status(409).json({message:'Configure o e-mail técnico do remetente.'});
    const data=await fetch(url,{method:'POST',headers:{Accept:'application/json',Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'ReVeste ('+email+')'},body:JSON.stringify(payload(order,settings))}).then(parse);
    const quotes=(Array.isArray(data)?data:[]).filter(item=>!item.error).map(item=>({service_id:Number(item.id),service:String(item.name||'Serviço'),company:String(item.company?.name||'Transportadora'),price:Number(item.custom_price??item.price??0),delivery_days:Number(item.custom_delivery_time??item.delivery_time??0)})).filter(item=>item.price>0);
    return res.json({sandbox,quotes});
  }catch(error){return res.status(error.statusCode||500).json({message:error.message})}
}
