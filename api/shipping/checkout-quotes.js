import { decrypt } from '../admin/payment-settings.js';
import { enforceRateLimit } from '../../lib/server/rate-limit.js';

const digits=value=>String(value||'').replace(/\D/g,'');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;

async function parse(response){
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.message||data.error||'Não foi possível calcular o frete.'),{statusCode:response.status>=500?502:409});
  return data;
}

async function context(req,res){
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!base||!anon||!service)throw Object.assign(new Error('Supabase não configurado.'),{statusCode:503});
  await enforceRateLimit(req,res,{base,service,scope:'checkout-shipping-quotes',limit:20,windowSeconds:120});
  if(!token)throw Object.assign(new Error('Sessão ausente.'),{statusCode:401});
  const userRes=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token}});
  if(!userRes.ok)throw Object.assign(new Error('Sessão expirada.'),{statusCode:401});
  const user=await userRes.json();
  const profileRes=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role',{headers:{apikey:service,Authorization:'Bearer '+service}});
  const profiles=profileRes.ok?await profileRes.json():[];
  if(profiles[0]?.role!=='customer')throw Object.assign(new Error('Cotação disponível apenas para clientes.'),{statusCode:403});
  return{base,service,user};
}

async function secret(base,service){
  const response=await fetch(base+'/rest/v1/integration_secrets?provider=eq.melhorenvio&select=encrypted_value',{headers:{apikey:service,Authorization:'Bearer '+service}});
  const rows=response.ok?await response.json():[];
  return rows[0]?.encrypted_value?decrypt(rows[0].encrypted_value):'';
}

function normalizeItems(raw){
  if(!Array.isArray(raw)||!raw.length||raw.length>50)throw Object.assign(new Error('Sacola inválida para cotação.'),{statusCode:400});
  const grouped=new Map();
  for(const item of raw){
    const id=String(item?.product_id||'');
    const quantity=Number(item?.quantity||0);
    if(!uuid.test(id)||!Number.isInteger(quantity)||quantity<=0||quantity>20)throw Object.assign(new Error('Item inválido na cotação.'),{statusCode:400});
    grouped.set(id,(grouped.get(id)||0)+quantity);
  }
  return [...grouped].map(([product_id,quantity])=>({product_id,quantity}));
}

async function pricing(base,service,items,couponCode){
  const headers={apikey:service,Authorization:'Bearer '+service};
  const ids=items.map(item=>item.product_id);
  const productsRes=await fetch(base+'/rest/v1/products?id=in.('+ids.join(',')+')&select=id,price,stock,active',{headers});
  const products=await productsRes.json();
  if(!productsRes.ok)throw new Error(products?.message||'Não foi possível validar a sacola.');
  const byId=new Map(products.map(item=>[item.id,item]));
  let subtotal=0;
  for(const requested of items){
    const product=byId.get(requested.product_id);
    if(!product?.active||Number(product.stock)<requested.quantity)throw Object.assign(new Error('Uma peça ficou indisponível. Atualize a sacola.'),{statusCode:409});
    subtotal+=Number(product.price)*requested.quantity;
  }
  subtotal=Number(subtotal.toFixed(2));
  let discount=0,coupon=null;
  if(couponCode){
    const couponRes=await fetch(base+'/rest/v1/coupons?code=eq.'+encodeURIComponent(couponCode)+'&active=eq.true&select=code,discount_type,discount_value,min_order_value,usage_limit,used_count,expires_at&limit=1',{headers});
    const coupons=couponRes.ok?await couponRes.json():[],row=coupons[0];
    const expired=row?.expires_at&&new Date(row.expires_at).getTime()<=Date.now();
    if(!row||expired||Number(row.used_count)>=Number(row.usage_limit)||subtotal<Number(row.min_order_value||0))throw Object.assign(new Error('Cupom inválido, esgotado, expirado ou fora das regras.'),{statusCode:409});
    discount=row.discount_type==='percentage'?subtotal*Number(row.discount_value)/100:Number(row.discount_value);
    discount=Number(Math.min(subtotal,Math.max(0,discount)).toFixed(2));
    coupon=row.code;
  }
  return{subtotal,discount,coupon};
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  try{
    const{base,service,user}=await context(req,res);
    const items=normalizeItems(req.body?.items);
    const postal=digits(req.body?.postal_code);
    if(postal.length!==8)return res.status(400).json({message:'Informe um CEP válido.'});
    const couponCode=String(req.body?.coupon_code||'').trim().toUpperCase();
    const[{subtotal,discount,coupon},storeRes,shippingRes,token]=await Promise.all([
      pricing(base,service,items,couponCode),
      fetch(base+'/rest/v1/store_settings?id=eq.1&select=support_email,free_shipping_threshold&limit=1',{headers:{apikey:service,Authorization:'Bearer '+service}}),
      fetch(base+'/rest/v1/shipping_settings?id=eq.1&select=origin_email,origin_zip_code,package_width,package_height,package_length,package_weight,melhorenvio_sandbox&limit=1',{headers:{apikey:service,Authorization:'Bearer '+service}}),
      secret(base,service)
    ]);
    if(!token)return res.status(409).json({message:'Frete ao vivo ainda não configurado.'});
    const store=(storeRes.ok?await storeRes.json():[])[0]||{},shipping=(shippingRes.ok?await shippingRes.json():[])[0]||{};
    if(shipping.melhorenvio_sandbox!==false)return res.status(409).json({message:'Frete ao vivo em homologação. Usando a tabela de frete da loja.'});
    const origin=digits(shipping.origin_zip_code);
    if(origin.length!==8)return res.status(409).json({message:'CEP de origem ainda não configurado.'});
    const volume={width:Number(shipping.package_width),height:Number(shipping.package_height),length:Number(shipping.package_length),weight:Number(shipping.package_weight)};
    if(!Object.values(volume).every(positive))return res.status(409).json({message:'Pacote padrão ainda não configurado.'});
    const email=String(shipping.origin_email||store.support_email||'').trim();
    if(!email)return res.status(409).json({message:'E-mail técnico do frete ainda não configurado.'});
    const sandbox=shipping.melhorenvio_sandbox!==false;
    const url=(sandbox?'https://sandbox.melhorenvio.com.br':'https://www.melhorenvio.com.br')+'/api/v2/me/shipment/calculate';
    const response=await fetch(url,{method:'POST',headers:{Accept:'application/json',Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'ReVeste ('+email+')'},body:JSON.stringify({from:{postal_code:origin},to:{postal_code:postal},volumes:[volume],options:{insurance_value:Math.max(0,subtotal-discount),receipt:false,own_hand:false}})}).then(parse);
    const quotes=(Array.isArray(response)?response:[]).filter(item=>!item.error).map(item=>({service_id:String(item.id),service_name:String(item.name||'Serviço'),carrier:String(item.company?.name||'Transportadora'),quoted_amount:Number(item.custom_price??item.price??0),delivery_days:Number(item.custom_delivery_time??item.delivery_time??0)})).filter(item=>item.quoted_amount>0);
    if(!quotes.length)return res.json({quotes:[],sandbox});
    await fetch(base+'/rest/v1/shipping_quotes?customer_id=eq.'+encodeURIComponent(user.id)+'&expires_at=lt.'+encodeURIComponent(new Date(Date.now()-86400000).toISOString()),{method:'DELETE',headers:{apikey:service,Authorization:'Bearer '+service}});
    const insert=quotes.map(quote=>({customer_id:user.id,provider:'melhorenvio',service_id:quote.service_id,service_name:quote.service_name,carrier:quote.carrier,postal_code:postal,merchandise_subtotal:subtotal,discount_value:discount,coupon_code:coupon,quoted_amount:quote.quoted_amount,delivery_days:quote.delivery_days||null}));
    const insertRes=await fetch(base+'/rest/v1/shipping_quotes',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(insert)});
    const rows=await insertRes.json();
    if(!insertRes.ok)throw new Error(rows?.message||'Não foi possível registrar as cotações.');
    const freeThreshold=Number(store.free_shipping_threshold||0);
    const byService=new Map(quotes.map(quote=>[quote.service_id,quote]));
    return res.json({sandbox,quotes:rows.map(row=>({...byService.get(row.service_id),quote_id:row.id,customer_price:freeThreshold>0&&subtotal>=freeThreshold?0:Number(row.quoted_amount)}))});
  }catch(error){return res.status(error.statusCode||500).json({message:error.message})}
}
