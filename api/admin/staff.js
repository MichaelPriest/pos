import { enforceRateLimit } from '../../lib/server/rate-limit.js';

const roles = new Set(['admin','manager','cashier','inventory']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStaffPayload(input = {}) {
  const payload = {
    name:String(input.name || '').trim(),
    email:String(input.email || '').trim().toLowerCase(),
    password:String(input.password || ''),
    role:String(input.role || ''),
    job_title:String(input.job_title || '').trim(),
    department:String(input.department || '').trim(),
    admission_date:input.admission_date || null,
    salary:input.salary === '' || input.salary == null ? null : Number(input.salary),
  };
  if (payload.name.length < 3 || payload.name.length > 120) throw Object.assign(new Error('Informe o nome completo do funcionário.'),{statusCode:400});
  if (!emailPattern.test(payload.email) || payload.email.length > 180) throw Object.assign(new Error('Informe um e-mail corporativo válido.'),{statusCode:400});
  if (payload.password.length < 8 || payload.password.length > 72) throw Object.assign(new Error('A senha temporária deve ter entre 8 e 72 caracteres.'),{statusCode:400});
  if (!roles.has(payload.role)) throw Object.assign(new Error('Nível de acesso inválido.'),{statusCode:400});
  if (payload.salary != null && (!Number.isFinite(payload.salary) || payload.salary < 0)) throw Object.assign(new Error('Salário inválido.'),{statusCode:400});
  return payload;
}

async function adminContext(req) {
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!base||!anon||!service)throw Object.assign(new Error('Supabase não configurado'),{statusCode:503});
  if(!token)throw Object.assign(new Error('Sessão ausente'),{statusCode:401});
  const userResponse=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});
  if(!userResponse.ok)throw Object.assign(new Error('Sessão inválida'),{statusCode:401});
  const user=await userResponse.json();
  const profileResponse=await fetch(`${base}/rest/v1/profiles?id=eq.${user.id}&select=role`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});
  const profiles=await profileResponse.json();
  if(!profileResponse.ok||profiles[0]?.role!=='admin')throw Object.assign(new Error('Somente administradores cadastram funcionários'),{statusCode:403});
  return {base,service,actor:user.id};
}

const parse = async (response, fallback) => {
  const data = await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.msg||data.message||fallback),{statusCode:response.status===422?409:502});
  return data;
};

export default async function handler(req,res) {
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  let createdUserId=null,context;
  try {
    context=await adminContext(req);
    await enforceRateLimit(req,res,{base:context.base,service:context.service,scope:'admin-staff',limit:10,windowSeconds:300});
    const payload=validateStaffPayload(req.body);
    const headers={apikey:context.service,Authorization:`Bearer ${context.service}`,'Content-Type':'application/json'};
    const created=await fetch(`${context.base}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email:payload.email,password:payload.password,email_confirm:true,user_metadata:{name:payload.name,account_type:'staff'}})});
    const user=await parse(created,'Não foi possível criar o acesso');
    createdUserId=user.id;
    const profile=await fetch(`${context.base}/rest/v1/profiles?id=eq.${user.id}`,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({name:payload.name,email:payload.email,role:payload.role})});
    const profileRows=await parse(profile,'Não foi possível configurar o perfil profissional');
    if(!Array.isArray(profileRows)||!profileRows.length)throw Object.assign(new Error('O perfil profissional não foi encontrado após criar o acesso.'),{statusCode:502});
    const details=await fetch(`${context.base}/rest/v1/employee_details`,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({profile_id:user.id,job_title:payload.job_title||null,department:payload.department||null,admission_date:payload.admission_date,salary:payload.salary})});
    await parse(details,'Não foi possível cadastrar os dados funcionais');
    return res.status(201).json({id:user.id,created:true});
  } catch(error) {
    if(createdUserId&&context)await fetch(`${context.base}/auth/v1/admin/users/${createdUserId}`,{method:'DELETE',headers:{apikey:context.service,Authorization:`Bearer ${context.service}`}}).catch(()=>{});
    return res.status(error.statusCode||500).json({message:error.message,rolled_back:Boolean(createdUserId)});
  }
}
