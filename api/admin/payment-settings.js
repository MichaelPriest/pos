import crypto from 'node:crypto';
import { enforceRateLimit } from '../../lib/server/rate-limit.js';

export const providers=['stripe','mercadopago','pagbank','mercadolivre','shopee','meta','whatsapp','melhorenvio','correios'];
const key=()=>{if(!process.env.APP_ENCRYPTION_KEY)throw new Error('APP_ENCRYPTION_KEY não configurada');return crypto.createHash('sha256').update(process.env.APP_ENCRYPTION_KEY).digest()};
export const encrypt=value=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`};
export const decrypt=value=>{const parts=String(value||'').split('.');if(parts.length!==3)throw new Error('Credencial criptografada inválida');const[iv,tag,data]=parts,decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]).toString()};

async function context(req){
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY,token=req.headers.authorization?.replace('Bearer ','');
  if(!base||!anon||!service)throw Object.assign(new Error('Supabase não configurado'),{statusCode:503});
  if(!token)throw Object.assign(new Error('Sessão ausente'),{statusCode:401});
  const userRes=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});
  if(!userRes.ok)throw Object.assign(new Error('Sessão inválida'),{statusCode:401});
  const user=await userRes.json(),profileRes=await fetch(`${base}/rest/v1/profiles?id=eq.${user.id}&select=role`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),profiles=await profileRes.json();
  if(!profileRes.ok||profiles[0]?.role!=='admin')throw Object.assign(new Error('Somente administradores podem acessar credenciais'),{statusCode:403});
  return{base,service};
}

const providerFrom=req=>String(req.body?.provider||req.query?.provider||'').toLowerCase();
export default async function handler(req,res){
  try{
    if(!['GET','PUT','DELETE'].includes(req.method))return res.status(405).json({message:'Método não permitido'});
    const{base,service}=await context(req);
    await enforceRateLimit(req,res,{base,service,scope:'admin-integrations',limit:30,windowSeconds:300});
    const headers={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
    if(req.method==='GET'){
      const response=await fetch(`${base}/rest/v1/integration_secrets?select=provider,encrypted_value,updated_at`,{headers}),rows=await response.json();
      if(!response.ok)throw Object.assign(new Error(rows.message||'Não foi possível consultar o cofre'),{statusCode:502});
      return res.json(Object.fromEntries(providers.map(provider=>{const row=rows.find(item=>item.provider===provider);return[provider,{configured:Boolean(row),masked:row?'••••••••••••':'',updated_at:row?.updated_at}]})));
    }
    const provider=providerFrom(req);
    if(!providers.includes(provider))return res.status(400).json({message:'Provedor inválido'});
    if(req.method==='DELETE'){
      const response=await fetch(`${base}/rest/v1/integration_secrets?provider=eq.${encodeURIComponent(provider)}`,{method:'DELETE',headers});
      if(!response.ok)return res.status(502).json({message:'Não foi possível remover a credencial'});
      return res.json({removed:true,provider});
    }
    const secret=String(req.body?.secret||'').trim();
    if(secret.length<8||secret.length>8192)return res.status(400).json({message:'Credencial deve ter entre 8 e 8192 caracteres'});
    const response=await fetch(`${base}/rest/v1/integration_secrets?on_conflict=provider`,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({provider,encrypted_value:encrypt(secret),updated_at:new Date().toISOString()})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return res.status(502).json({message:data.message||'Não foi possível salvar a credencial'});
    return res.json({saved:true,provider});
  }catch(error){return res.status(error.statusCode||500).json({message:error.message})}
}
