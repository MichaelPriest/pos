const check = async (name, url, options, timeout = 4000) => {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal:AbortSignal.timeout(timeout) });
    return { name, ok:response.ok, status:response.status, latency_ms:Date.now()-started };
  } catch (error) {
    return { name, ok:false, status:0, latency_ms:Date.now()-started, error:error.name==='TimeoutError'?'timeout':'unavailable' };
  }
};

const validProductionOrigin = value => {
  try { const parsed=new URL(value);return parsed.protocol==='https:'&&parsed.origin===value.replace(/\/$/,''); } catch { return false; }
};

export function productionChecks(env, vaultProviders = [], settings = {}) {
  const vault=new Set(vaultProviders);
  const services={
    stripe:Boolean(env.STRIPE_SECRET_KEY||vault.has('stripe')),
    mercadopago:Boolean(env.MERCADOPAGO_ACCESS_TOKEN||vault.has('mercadopago')),
    pagbank:Boolean(env.PAGBANK_TOKEN||vault.has('pagbank')),
    webhook_signature:Boolean(env.STRIPE_WEBHOOK_SECRET),
  };
  const cardReady=settings.card_enabled!==false&&((settings.stripe_enabled&&services.stripe)||(settings.mercadopago_enabled&&services.mercadopago));
  const pixReady=settings.pix_enabled!==false&&((settings.mercadopago_enabled&&services.mercadopago)||(settings.pagbank_enabled&&services.pagbank));
  const originConfigured=['shipping_origin_name','shipping_origin_email','shipping_origin_phone','shipping_origin_zip_code','shipping_origin_street','shipping_origin_number','shipping_origin_neighborhood','shipping_origin_city','shipping_origin_state'].every(key=>String(settings[key]||'').trim().length>0);
  const packageConfigured=['shipping_package_width','shipping_package_height','shipping_package_length','shipping_package_weight'].every(key=>Number(settings[key])>0);
  const documentModeConfigured=['declaration','invoice'].includes(settings.shipping_document_mode);
  const melhorEnvioConfigured=vault.has('melhorenvio');
  const logistics={
    melhorenvio_configured:melhorEnvioConfigured,
    environment:settings.melhorenvio_sandbox===false?'production':'sandbox',
    origin_configured:originConfigured,
    package_configured:packageConfigured,
    document_mode_configured:documentModeConfigured,
    customer_live_quotes_ready:melhorEnvioConfigured&&settings.melhorenvio_sandbox===false&&originConfigured&&packageConfigured&&documentModeConfigured,
  };
  return {
    services,logistics,
    checks:[
      {name:'site_url',ok:validProductionOrigin(env.SITE_URL)},
      {name:'service_role',ok:Boolean(env.SUPABASE_SERVICE_ROLE_KEY)},
      {name:'encryption_key',ok:String(env.APP_ENCRYPTION_KEY||'').length>=32},
      {name:'cron_secret',ok:String(env.CRON_SECRET||'').length>=24},
      {name:'payment_provider',ok:Boolean(cardReady||pixReady)},
      {name:'stripe_webhook',ok:!settings.stripe_enabled||!services.stripe||services.webhook_signature},
      {name:'sales_enabled',ok:settings.maintenance_mode===false},
    ],
  };
}

export function healthStatus(checks){ return checks.every(item=>item.ok)?'healthy':checks.some(item=>item.ok)?'degraded':'unavailable'; }

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({message:'Método não permitido'});
  const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon)return res.status(503).json({status:'unavailable',checks:[],message:'Supabase não configurado'});
  const publicHeaders={apikey:anon,Authorization:`Bearer ${anon}`};
  const serviceHeaders={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
  const settingsUrl=`${base}/rest/v1/store_settings?id=eq.1&select=id,standard_shipping_cost,express_shipping_cost,maintenance_mode,stripe_enabled,mercadopago_enabled,pagbank_enabled,pix_enabled,card_enabled,shipping_origin_name,shipping_origin_email,shipping_origin_phone,shipping_origin_zip_code,shipping_origin_street,shipping_origin_number,shipping_origin_neighborhood,shipping_origin_city,shipping_origin_state,shipping_package_width,shipping_package_height,shipping_package_length,shipping_package_weight,shipping_document_mode,melhorenvio_sandbox`;
  let settings={},settingsCheck;
  try{const started=Date.now(),response=await fetch(settingsUrl,{headers:publicHeaders,signal:AbortSignal.timeout(4000)}),rows=response.ok?await response.json():[];settings=rows[0]||{};settingsCheck={name:'database_schema',ok:response.ok&&Boolean(settings.id),status:response.status,latency_ms:Date.now()-started}}catch(error){settingsCheck={name:'database_schema',ok:false,status:0,error:error.name==='TimeoutError'?'timeout':'unavailable'}}
  const infrastructure=await Promise.all([
    Promise.resolve(settingsCheck),
    check('authentication',`${base}/auth/v1/settings`,{headers:{apikey:anon}}),
    service?check('webhook_claims',`${base}/rest/v1/rpc/finish_webhook_event`,{method:'POST',headers:serviceHeaders,body:JSON.stringify({p_provider:'health',p_event_id:'health',p_claim_token:'00000000-0000-4000-8000-000000000000',p_success:false,p_error:null})}):Promise.resolve({name:'webhook_claims',ok:false,status:0,error:'service_role_missing'}),
  ]);
  let vaultProviders=[];
  if(service){
    try{const response=await fetch(`${base}/rest/v1/integration_secrets?select=provider`,{headers:serviceHeaders,signal:AbortSignal.timeout(4000)});if(response.ok)vaultProviders=(await response.json()).map(item=>item.provider)}catch{}
  }
  const readiness=productionChecks(process.env,vaultProviders,settings),checks=[...infrastructure,...readiness.checks],status=healthStatus(checks);
  res.setHeader('Cache-Control','no-store');
  return res.status(status==='healthy'?200:503).json({status,checks,services:readiness.services,logistics:readiness.logistics,checked_at:new Date().toISOString()});
}
