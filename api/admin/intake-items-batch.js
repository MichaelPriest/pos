import { enforceRateLimit } from '../../lib/server/rate-limit.js';

const allowedConditions=new Set(['novo','excelente','bom','regular']);
const text=(value,max=255)=>String(value??'').trim().slice(0,max);
const money=value=>Number(Number(value||0).toFixed(2));

async function context(req,res){
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!base||!anon||!service)throw Object.assign(new Error('Supabase não configurado.'),{statusCode:503});
  await enforceRateLimit(req,res,{base,service,scope:'admin-intake-items-batch',limit:20,windowSeconds:120});
  if(!token)throw Object.assign(new Error('Sessão ausente.'),{statusCode:401});
  const userRes=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+token}});
  if(!userRes.ok)throw Object.assign(new Error('Sessão inválida.'),{statusCode:401});
  const user=await userRes.json();
  const profileRes=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role',{headers:{apikey:service,Authorization:'Bearer '+service}});
  const profiles=profileRes.ok?await profileRes.json():[];
  if(!['admin','manager','inventory'].includes(profiles[0]?.role))throw Object.assign(new Error('Conta sem permissão para cadastrar entradas.'),{statusCode:403});
  return{base,service};
}

function normalizeItem(item,intakeId,sourceType){
  const name=text(item?.name,160),category=text(item?.category,80),size=text(item?.size,40),condition=text(item?.condition_grade,20);
  const sale=money(item?.sale_price),cost=money(item?.acquisition_cost),commission=Number(Number(item?.store_commission_percent??40).toFixed(2));
  if(!name||!category||!size)throw Object.assign(new Error('Todas as peças precisam de nome, categoria e tamanho.'),{statusCode:400});
  if(!allowedConditions.has(condition))throw Object.assign(new Error('Estado de conservação inválido.'),{statusCode:400});
  if(!(sale>0))throw Object.assign(new Error('Todas as peças precisam de preço de venda maior que zero.'),{statusCode:400});
  if(sourceType==='purchase'&&cost<0)throw Object.assign(new Error('Custo de aquisição inválido.'),{statusCode:400});
  if(sourceType!=='purchase'&&cost!==0)throw Object.assign(new Error('Somente compra própria pode ter custo de aquisição.'),{statusCode:400});
  if(!(commission>=0&&commission<=100))throw Object.assign(new Error('Percentual de comissão inválido.'),{statusCode:400});
  const images=Array.isArray(item?.images)?item.images.filter(value=>typeof value==='string'&&value.startsWith('http')).slice(0,5):[];
  return{
    intake_id:intakeId,name,description:text(item?.description,2000)||null,category,brand:text(item?.brand,120)||null,
    size,color:text(item?.color,80)||null,condition_grade:condition,acquisition_cost:cost,sale_price:sale,
    store_commission_percent:sourceType==='consignment'?commission:40,images,status:'pending'
  };
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  try{
    const{base,service}=await context(req,res);
    const intakeId=text(req.body?.intake_id,80),items=Array.isArray(req.body?.items)?req.body.items:[];
    if(!intakeId)return res.status(400).json({message:'Entrada obrigatória.'});
    if(!items.length||items.length>50)return res.status(400).json({message:'Envie entre 1 e 50 peças por lote.'});
    const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
    const intakeRes=await fetch(base+'/rest/v1/inventory_intakes?id=eq.'+encodeURIComponent(intakeId)+'&select=id,source_type,status&limit=1',{headers});
    const rows=intakeRes.ok?await intakeRes.json():[],entry=rows[0];
    if(!entry)return res.status(404).json({message:'Entrada não encontrada.'});
    if(!['draft','appraisal'].includes(entry.status))return res.status(409).json({message:'Esta entrada não aceita novas peças.'});
    const payload=items.map(item=>normalizeItem(item,intakeId,entry.source_type));
    const response=await fetch(base+'/rest/v1/inventory_intake_items',{
      method:'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(payload)
    });
    const inserted=await response.json().catch(()=>[]);
    if(!response.ok)throw new Error(inserted?.message||'Não foi possível salvar o lote de peças.');
    return res.status(201).json({count:inserted.length,items:inserted});
  }catch(error){return res.status(error.statusCode||500).json({message:error.message})}
}
