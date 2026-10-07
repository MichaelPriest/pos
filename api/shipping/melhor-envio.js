import { decrypt } from '../admin/payment-settings.js';
import { enforceRateLimit } from '../../lib/server/rate-limit.js';

const digits=value=>String(value||'').replace(/\D/g,'');
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;
const required=(value,message)=>{const text=String(value||'').trim();if(!text)throw Object.assign(new Error(message),{statusCode:409});return text};
const privateSettings=row=>({
  shipping_origin_name:row.origin_name,shipping_origin_email:row.origin_email,shipping_origin_phone:row.origin_phone,
  shipping_origin_document:row.origin_document,shipping_origin_company_document:row.origin_company_document,
  shipping_origin_state_register:row.origin_state_register,shipping_origin_zip_code:row.origin_zip_code,
  shipping_origin_street:row.origin_street,shipping_origin_number:row.origin_number,shipping_origin_complement:row.origin_complement,
  shipping_origin_neighborhood:row.origin_neighborhood,shipping_origin_city:row.origin_city,shipping_origin_state:row.origin_state,
  shipping_package_width:row.package_width,shipping_package_height:row.package_height,shipping_package_length:row.package_length,
  shipping_package_weight:row.package_weight,shipping_document_mode:row.document_mode,
  melhorenvio_sandbox:row.melhorenvio_sandbox,melhorenvio_auto_checkout:row.melhorenvio_auto_checkout
});

async function parse(response){
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.message||data.error||'O Melhor Envio recusou a operação.'),{statusCode:response.status>=500?502:409});
  return data;
}
async function context(req,res){
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY,token=req.headers.authorization?.replace('Bearer ','');
  if(!base||!anon||!service)throw Object.assign(new Error('Supabase não configurado.'),{statusCode:503});
  await enforceRateLimit(req,res,{base,service,scope:'melhor-envio',limit:30,windowSeconds:300});
  if(!token)throw Object.assign(new Error('Sessão ausente.'),{statusCode:401});
  const userRes=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token}});
  if(!userRes.ok)throw Object.assign(new Error('Sessão expirada.'),{statusCode:401});
  const user=await userRes.json(),profileRes=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role',{headers:{apikey:service,Authorization:'Bearer '+service}}),profiles=profileRes.ok?await profileRes.json():[];
  if(!['admin','manager'].includes(profiles[0]?.role))throw Object.assign(new Error('Conta sem permissão para operar logística.'),{statusCode:403});
  return{base,service};
}
async function load(base,service,orderId){
  const headers={apikey:service,Authorization:'Bearer '+service};
  const orderRes=await fetch(base+'/rest/v1/orders?id=eq.'+encodeURIComponent(orderId)+'&select=*,order_items(id,product_id,quantity,unit_price,products(name))&limit=1',{headers}),orders=await orderRes.json();
  if(!orderRes.ok)throw new Error(orders?.message||'Não foi possível consultar o pedido.');
  const order=orders[0];if(!order)throw Object.assign(new Error('Pedido não encontrado.'),{statusCode:404});
  const [profileRes,storeRes,shippingRes]=await Promise.all([
    fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(order.customer_id)+'&select=name,email,phone,document&limit=1',{headers}),
    fetch(base+'/rest/v1/store_settings?id=eq.1&select=support_email,free_shipping_threshold&limit=1',{headers}),
    fetch(base+'/rest/v1/shipping_settings?id=eq.1&select=*&limit=1',{headers})
  ]);
  const store=(storeRes.ok?await storeRes.json():[])[0]||{},shipping=(shippingRes.ok?await shippingRes.json():[])[0]||{};
  return{order,customer:(profileRes.ok?await profileRes.json():[])[0]||{},settings:{...store,...privateSettings(shipping)}};
}
async function secret(base,service){
  const response=await fetch(base+'/rest/v1/integration_secrets?provider=eq.melhorenvio&select=encrypted_value',{headers:{apikey:service,Authorization:'Bearer '+service}}),rows=response.ok?await response.json():[];
  return rows[0]?.encrypted_value?decrypt(rows[0].encrypted_value):'';
}
const personFields=value=>{const document=digits(value);return document.length===14?{company_document:document}:document.length===11?{document}:{}};
function volume(settings){
  const value={width:Number(settings.shipping_package_width),height:Number(settings.shipping_package_height),length:Number(settings.shipping_package_length),weight:Number(settings.shipping_package_weight)};
  if(!Object.values(value).every(positive))throw Object.assign(new Error('Configure largura, altura, comprimento e peso padrão do pacote em Integrações.'),{statusCode:409});
  return value;
}
function postal(value,message){const code=digits(value);if(code.length!==8)throw Object.assign(new Error(message),{statusCode:409});return code}
function merchandise(order){return Math.max(0,Number(order.subtotal||0)-Number(order.discount||0))}
function quotePayload(order,settings){return{from:{postal_code:postal(settings.shipping_origin_zip_code,'Configure o CEP de origem.')},to:{postal_code:postal(order.shipping_address?.zip_code,'Pedido sem CEP de destino válido.')},volumes:[volume(settings)],options:{insurance_value:merchandise(order),receipt:false,own_hand:false}}}
function sender(settings){
  const data={name:required(settings.shipping_origin_name,'Configure o nome do remetente.'),email:required(settings.shipping_origin_email||settings.support_email,'Configure o e-mail do remetente.'),phone:digits(required(settings.shipping_origin_phone,'Configure o telefone do remetente.')),...personFields(settings.shipping_origin_company_document||settings.shipping_origin_document),address:required(settings.shipping_origin_street,'Configure a rua do remetente.'),complement:String(settings.shipping_origin_complement||''),number:required(settings.shipping_origin_number,'Configure o número do remetente.'),district:required(settings.shipping_origin_neighborhood,'Configure o bairro do remetente.'),city:required(settings.shipping_origin_city,'Configure a cidade do remetente.'),postal_code:postal(settings.shipping_origin_zip_code,'Configure o CEP de origem.'),state_abbr:required(settings.shipping_origin_state,'Configure a UF do remetente.').toUpperCase()};
  if(settings.shipping_document_mode==='invoice'){if(!data.company_document)throw Object.assign(new Error('Envio com NF-e exige CNPJ do remetente.'),{statusCode:409});data.state_register=required(settings.shipping_origin_state_register,'Envio com NF-e exige inscrição estadual do remetente.')}else if(settings.shipping_origin_state_register)data.state_register=String(settings.shipping_origin_state_register);
  return data;
}
function recipient(order,customer){
  const a=order.shipping_address||{};
  return{name:required(customer.name||order.customer_name,'Pedido sem destinatário.'),email:required(customer.email,'Cliente sem e-mail.'),phone:digits(required(customer.phone,'Cliente sem telefone.')),...personFields(customer.document||order.customer_document),address:required(a.street,'Pedido sem rua.'),complement:String(a.complement||''),number:required(a.number,'Pedido sem número.'),district:required(a.neighborhood,'Pedido sem bairro.'),city:required(a.city,'Pedido sem cidade.'),postal_code:postal(a.zip_code,'Pedido sem CEP válido.'),country_id:'BR',state_abbr:required(a.state,'Pedido sem UF.').toUpperCase()};
}
const products=order=>(order.order_items||[]).map(item=>({name:String(item.products?.name||'Peça ReVeste').slice(0,255),quantity:Number(item.quantity||1),unitary_value:Number(item.unit_price||0)}));
const apiBase=settings=>settings.melhorenvio_sandbox!==false?'https://sandbox.melhorenvio.com.br':'https://www.melhorenvio.com.br';
const apiHeaders=(token,settings)=>({Accept:'application/json',Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'ReVeste ('+required(settings.shipping_origin_email||settings.support_email,'Configure o e-mail técnico do remetente.')+')'});
const melhorFetch=(path,options,token,settings)=>fetch(apiBase(settings)+path,{...options,headers:{...apiHeaders(token,settings),...(options?.headers||{})}}).then(parse);
const normalize=row=>!row||row.error?null:{service_id:Number(row.id),service:String(row.name||'Serviço'),company:String(row.company?.name||'Transportadora'),price:Number(row.custom_price??row.price??0),delivery_days:Number(row.custom_delivery_time??row.delivery_time??0)};
async function quotes(order,settings,token){const data=await melhorFetch('/api/v2/me/shipment/calculate',{method:'POST',body:JSON.stringify(quotePayload(order,settings))},token,settings);return(Array.isArray(data)?data:[]).map(normalize).filter(item=>item&&item.price>0)}
async function patchOrder(base,service,id,patch){const response=await fetch(base+'/rest/v1/orders?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({...patch,shipping_provider_updated_at:new Date().toISOString()})});if(!response.ok)throw new Error('Não foi possível registrar a logística no pedido.')}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  try{
    const action=String(req.body?.action||'quote'),orderId=String(req.body?.order_id||'').trim();
    if(!orderId)return res.status(400).json({message:'Pedido obrigatório.'});
    const{base,service}=await context(req,res),{order,customer,settings}=await load(base,service,orderId);
    if(order.shipping_service==='Retirada na loja')return res.status(409).json({message:'Pedido marcado para retirada na loja.'});
    if(!['pago','separando','enviado'].includes(order.status))return res.status(409).json({message:'Somente pedidos pagos podem operar logística.'});
    const token=await secret(base,service);if(!token)return res.status(409).json({message:'Configure o token do Melhor Envio em Integrações.'});

    if(action==='quote')return res.json({sandbox:settings.melhorenvio_sandbox!==false,quotes:await quotes(order,settings,token)});

    if(action==='cart'){
      const selected=Number(req.body?.service_id);if(!Number.isInteger(selected)||selected<=0)return res.status(400).json({message:'Selecione um serviço válido.'});
      if(!['declaration','invoice'].includes(settings.shipping_document_mode))return res.status(409).json({message:'Escolha NF-e ou Declaração de Conteúdo em Integrações.'});
      const quote=(await quotes(order,settings,token)).find(item=>item.service_id===selected);if(!quote)return res.status(409).json({message:'Serviço indisponível. Faça uma nova cotação.'});
      const options={platform:'ReVeste',reminder:'Pedido '+order.id.slice(0,8).toUpperCase(),insurance_value:merchandise(order),receipt:false,own_hand:false,reverse:false,tags:[{tag:order.id.slice(0,8).toUpperCase(),url:null}]};
      if(settings.shipping_document_mode==='invoice'){const key=digits(req.body?.invoice_key||order.shipping_invoice_key);if(key.length!==44)return res.status(409).json({message:'Informe a chave de 44 dígitos da NF-e.'});options.invoice={key};await patchOrder(base,service,order.id,{shipping_invoice_key:key})}
      const cart=await melhorFetch('/api/v2/me/cart',{method:'POST',body:JSON.stringify({service:selected,from:sender(settings),to:recipient(order,customer),products:products(order),volumes:[volume(settings)],options})},token,settings),shipmentId=String(cart.id||'');
      if(!shipmentId)throw new Error('Melhor Envio não retornou o ID da etiqueta.');
      await patchOrder(base,service,order.id,{shipping_provider:'melhorenvio',shipping_service_id:String(selected),shipping_provider_shipment_id:shipmentId,shipping_provider_status:'cart',shipping_quote_amount:quote.price,shipping_quote_days:quote.delivery_days||null,carrier:quote.company,shipping_service:quote.service});
      return res.status(201).json({shipment_id:shipmentId,quote});
    }

    const shipmentId=String(order.shipping_provider_shipment_id||'');if(!shipmentId)return res.status(409).json({message:'Crie a etiqueta no carrinho antes desta operação.'});
    if(action==='checkout'){if(req.body?.confirm_purchase!==true)return res.status(400).json({message:'Confirmação explícita de compra é obrigatória.'});const data=await melhorFetch('/api/v2/me/shipment/checkout',{method:'POST',body:JSON.stringify({orders:[shipmentId]})},token,settings);await patchOrder(base,service,order.id,{shipping_provider_status:'purchased'});return res.json({purchased:true,data})}
    if(action==='generate'){if(req.body?.confirm_generate!==true)return res.status(400).json({message:'Confirmação explícita de geração é obrigatória.'});const data=await melhorFetch('/api/v2/me/shipment/generate',{method:'POST',body:JSON.stringify({orders:[shipmentId]})},token,settings);await patchOrder(base,service,order.id,{shipping_provider_status:'generated'});return res.json({generated:true,data})}
    if(action==='print'){const data=await melhorFetch('/api/v2/me/shipment/print',{method:'POST',body:JSON.stringify({mode:'public',orders:[shipmentId]})},token,settings),url=typeof data==='string'?data:(data.url||data.link||'');if(url)await patchOrder(base,service,order.id,{shipping_label_url:url,shipping_provider_status:'printed'});return res.json({label_url:url,data})}
    if(action==='tracking'){const data=await melhorFetch('/api/v2/me/shipment/tracking',{method:'POST',body:JSON.stringify({orders:[shipmentId]})},token,settings),state=data?.[shipmentId]||data?.data?.[shipmentId]||data,status=String(state?.status||order.shipping_provider_status||'unknown'),tracking=String(state?.tracking||state?.tracking_code||state?.code||'');await patchOrder(base,service,order.id,{shipping_provider_status:status,...(tracking?{tracking_code:tracking}:{})});return res.json({status,tracking_code:tracking,data})}
    return res.status(400).json({message:'Ação logística inválida.'});
  }catch(error){return res.status(error.statusCode||500).json({message:error.message})}
}
