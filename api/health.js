const check = async (name, url, options, timeout = 4000) => {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal:AbortSignal.timeout(timeout) });
    return { name, ok:response.ok, status:response.status, latency_ms:Date.now()-started };
  } catch (error) {
    return { name, ok:false, status:0, latency_ms:Date.now()-started, error:error.name==='TimeoutError'?'timeout':'unavailable' };
  }
};

export function healthStatus(checks){ return checks.every(item=>item.ok)?'healthy':checks.some(item=>item.ok)?'degraded':'unavailable'; }

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({message:'Método não permitido'});
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!base||!anon)return res.status(503).json({status:'unavailable',checks:[],message:'Supabase não configurado'});
  const checks=await Promise.all([
    check('database',`${base}/rest/v1/store_settings?id=eq.1&select=id`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`}}),
    check('authentication',`${base}/auth/v1/settings`,{headers:{apikey:anon}}),
  ]);
  const status=healthStatus(checks);
  res.setHeader('Cache-Control','no-store');
  return res.status(status==='healthy'?200:503).json({status,checks,services:{stripe:Boolean(process.env.STRIPE_SECRET_KEY),mercadopago:Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),pagbank:Boolean(process.env.PAGBANK_TOKEN),webhook_signature:Boolean(process.env.STRIPE_WEBHOOK_SECRET)},checked_at:new Date().toISOString()});
}
