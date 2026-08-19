import crypto from 'node:crypto';

export const clientAddress = req => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
export const rateLimitKey = (scope, req) => crypto.createHash('sha256').update(`${scope}:${clientAddress(req)}`).digest('hex');

export async function enforceRateLimit(req,res,{base,service,scope,limit=20,windowSeconds=60}){
  if(!base||!service)throw Object.assign(new Error('Serviço de proteção não configurado.'),{statusCode:503});
  const response=await fetch(`${base}/rest/v1/rpc/consume_api_rate_limit`,{
    method:'POST',
    headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_key:rateLimitKey(scope,req),p_limit:limit,p_window_seconds:windowSeconds}),
  });
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result.message||'Não foi possível validar o limite de acesso.'),{statusCode:503});
  res.setHeader('X-RateLimit-Limit',String(limit));
  res.setHeader('X-RateLimit-Remaining',String(Math.max(0,limit-Number(result.hits||0))));
  if(!result.allowed){res.setHeader('Retry-After',String(result.retry_after||windowSeconds));throw Object.assign(new Error('Muitas tentativas. Aguarde alguns instantes e tente novamente.'),{statusCode:429});}
  return result;
}
