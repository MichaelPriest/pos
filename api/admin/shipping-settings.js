import { enforceRateLimit } from '../../lib/server/rate-limit.js';

const fields=[
  'shipping_origin_name','shipping_origin_email','shipping_origin_phone','shipping_origin_document',
  'shipping_origin_company_document','shipping_origin_state_register','shipping_origin_zip_code',
  'shipping_origin_street','shipping_origin_number','shipping_origin_complement',
  'shipping_origin_neighborhood','shipping_origin_city','shipping_origin_state',
  'shipping_package_width','shipping_package_height','shipping_package_length','shipping_package_weight',
  'shipping_document_mode','melhorenvio_sandbox','melhorenvio_auto_checkout'
];

const toPublic=row=>({
  shipping_origin_name:row.origin_name||'',shipping_origin_email:row.origin_email||'',
  shipping_origin_phone:row.origin_phone||'',shipping_origin_document:row.origin_document||'',
  shipping_origin_company_document:row.origin_company_document||'',shipping_origin_state_register:row.origin_state_register||'',
  shipping_origin_zip_code:row.origin_zip_code||'',shipping_origin_street:row.origin_street||'',
  shipping_origin_number:row.origin_number||'',shipping_origin_complement:row.origin_complement||'',
  shipping_origin_neighborhood:row.origin_neighborhood||'',shipping_origin_city:row.origin_city||'',
  shipping_origin_state:row.origin_state||'',shipping_package_width:row.package_width,
  shipping_package_height:row.package_height,shipping_package_length:row.package_length,
  shipping_package_weight:row.package_weight,shipping_document_mode:row.document_mode||'',
  melhorenvio_sandbox:row.melhorenvio_sandbox!==false,melhorenvio_auto_checkout:Boolean(row.melhorenvio_auto_checkout)
});

const toRow=input=>({
  id:1,origin_name:input.shipping_origin_name||null,origin_email:input.shipping_origin_email||null,
  origin_phone:input.shipping_origin_phone||null,origin_document:input.shipping_origin_document||null,
  origin_company_document:input.shipping_origin_company_document||null,origin_state_register:input.shipping_origin_state_register||null,
  origin_zip_code:input.shipping_origin_zip_code||null,origin_street:input.shipping_origin_street||null,
  origin_number:input.shipping_origin_number||null,origin_complement:input.shipping_origin_complement||null,
  origin_neighborhood:input.shipping_origin_neighborhood||null,origin_city:input.shipping_origin_city||null,
  origin_state:String(input.shipping_origin_state||'').trim().toUpperCase()||null,
  package_width:input.shipping_package_width===''||input.shipping_package_width==null?null:Number(input.shipping_package_width),
  package_height:input.shipping_package_height===''||input.shipping_package_height==null?null:Number(input.shipping_package_height),
  package_length:input.shipping_package_length===''||input.shipping_package_length==null?null:Number(input.shipping_package_length),
  package_weight:input.shipping_package_weight===''||input.shipping_package_weight==null?null:Number(input.shipping_package_weight),
  document_mode:['declaration','invoice'].includes(input.shipping_document_mode)?input.shipping_document_mode:null,
  melhorenvio_sandbox:input.melhorenvio_sandbox!==false,
  melhorenvio_auto_checkout:Boolean(input.melhorenvio_auto_checkout),
  updated_at:new Date().toISOString()
});

async function context(req,res){
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!base||!anon||!service)throw Object.assign(new Error('Supabase não configurado.'),{statusCode:503});
  await enforceRateLimit(req,res,{base,service,scope:'admin-shipping-settings',limit:30,windowSeconds:300});
  if(!token)throw Object.assign(new Error('Sessão ausente.'),{statusCode:401});
  const userRes=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token}});
  if(!userRes.ok)throw Object.assign(new Error('Sessão inválida.'),{statusCode:401});
  const user=await userRes.json();
  const profileRes=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role',{headers:{apikey:service,Authorization:'Bearer '+service}});
  const profiles=profileRes.ok?await profileRes.json():[];
  if(profiles[0]?.role!=='admin')throw Object.assign(new Error('Somente administradores podem alterar a logística.'),{statusCode:403});
  return{base,service};
}

export default async function handler(req,res){
  if(!['GET','PUT'].includes(req.method))return res.status(405).json({message:'Método não permitido'});
  try{
    const{base,service}=await context(req,res);
    const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
    if(req.method==='GET'){
      const response=await fetch(base+'/rest/v1/shipping_settings?id=eq.1&select=*',{headers});
      const rows=await response.json();
      if(!response.ok)throw new Error(rows?.message||'Não foi possível consultar a logística.');
      return res.json(toPublic(rows[0]||{}));
    }
    const input=Object.fromEntries(fields.map(key=>[key,req.body?.[key]]));
    for(const key of ['shipping_package_width','shipping_package_height','shipping_package_length','shipping_package_weight']){
      if(input[key]!==''&&input[key]!=null&&(!Number.isFinite(Number(input[key]))||Number(input[key])<=0))return res.status(400).json({message:'Dimensões e peso devem ser maiores que zero.'});
    }
    const response=await fetch(base+'/rest/v1/shipping_settings?on_conflict=id',{
      method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(toRow(input))
    });
    const rows=await response.json().catch(()=>[]);
    if(!response.ok)throw new Error(rows?.message||'Não foi possível salvar a logística.');
    return res.json(toPublic(rows[0]||{}));
  }catch(error){return res.status(error.statusCode||500).json({message:error.message})}
}
