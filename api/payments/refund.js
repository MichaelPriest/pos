import { decrypt } from '../admin/payment-settings.js';
import { enforceRateLimit } from '../../lib/server/rate-limit.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function parse(response){
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data.error?.message||data.message||'O Stripe recusou o reembolso.');
    error.statusCode=response.status>=500?502:409;
    throw error;
  }
  return data;
}

async function stripeSecret(base,service){
  const response=await fetch(`${base}/rest/v1/integration_secrets?provider=eq.stripe&select=encrypted_value`,{
    headers:{apikey:service,Authorization:`Bearer ${service}`}
  });
  if(response.ok){
    const rows=await response.json();
    if(rows[0]?.encrypted_value)return decrypt(rows[0].encrypted_value);
  }
  return process.env.STRIPE_SECRET_KEY||'';
}

async function recordRefund(base,service,returnId,refund){
  const response=await fetch(`${base}/rest/v1/rpc/record_gateway_order_refund`,{
    method:'POST',
    headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      p_return_id:returnId,
      p_provider:'stripe',
      p_reference:String(refund.id||''),
      p_gateway_status:String(refund.status||'unknown'),
      p_completed:refund.status==='succeeded',
    }),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||'O Stripe processou o reembolso, mas o ReVeste não conseguiu conciliá-lo.');
  return data;
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido'});
  try{
    const base=process.env.VITE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon=process.env.VITE_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token=req.headers.authorization?.replace('Bearer ','');
    const returnId=String(req.body?.return_id||'').trim();

    if(!base||!anon||!service)return res.status(503).json({message:'Supabase não configurado.'});
    await enforceRateLimit(req,res,{base,service,scope:'payment-refund',limit:10,windowSeconds:60});
    if(!token||!uuid.test(returnId))return res.status(400).json({message:'Solicitação de reembolso inválida.'});

    const userResponse=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});
    if(!userResponse.ok)return res.status(401).json({message:'Sessão expirada.'});
    const user=await userResponse.json();

    const profileResponse=await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`,{
      headers:{apikey:service,Authorization:`Bearer ${service}`}
    });
    const profiles=profileResponse.ok?await profileResponse.json():[];
    if(!['admin','manager'].includes(profiles[0]?.role))return res.status(403).json({message:'Conta sem permissão para processar reembolsos.'});

    const returnResponse=await fetch(
      `${base}/rest/v1/order_returns?id=eq.${encodeURIComponent(returnId)}&select=*,orders(id,total,status,payment_provider,payment_reference,payment_method)&limit=1`,
      {headers:{apikey:service,Authorization:`Bearer ${service}`}}
    );
    const returns=await returnResponse.json();
    if(!returnResponse.ok)throw new Error(returns?.message||'Não foi possível consultar a devolução.');
    const item=returns[0],order=item?.orders;
    if(!item||!order)return res.status(404).json({message:'Devolução não encontrada.'});
    if(item.resolution!=='refund')return res.status(409).json({message:'Esta operação é uma troca e não exige estorno.'});
    if(item.status!=='received'&&item.status!=='completed')return res.status(409).json({message:'Receba a peça antes de processar o reembolso.'});
    if(item.refund_status==='completed')return res.status(200).json({completed:true,reference:item.refund_reference,status:item.refund_gateway_status||'succeeded',reused:true});
    if(order.payment_provider!=='stripe')return res.status(409).json({message:'Estorno automático disponível somente para Stripe neste momento. Confirme o reembolso externo manualmente.'});
    if(!order.payment_reference)return res.status(409).json({message:'Pedido sem referência Stripe para estorno automático.'});

    const secret=await stripeSecret(base,service);
    if(!secret)return res.status(503).json({message:'Credencial Stripe não configurada.'});

    const session=await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.payment_reference)}`,{
      headers:{Authorization:`Bearer ${secret}`}
    }).then(parse);

    const linkedOrder=session.client_reference_id||session.metadata?.order_id;
    if(linkedOrder!==order.id)return res.status(409).json({message:'A sessão Stripe não pertence a este pedido.'});
    if(!session.payment_intent)return res.status(409).json({message:'Pagamento Stripe sem PaymentIntent reembolsável.'});

    const amount=Math.round(Number(item.refund_amount||0)*100);
    const orderAmount=Math.round(Number(order.total||0)*100);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>orderAmount)return res.status(409).json({message:'Valor de reembolso inválido para este pedido.'});

    const body=new URLSearchParams({
      payment_intent:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id,
      amount:String(amount),
      reason:'requested_by_customer',
      'metadata[order_id]':order.id,
      'metadata[return_id]':item.id,
    });

    const refund=await fetch('https://api.stripe.com/v1/refunds',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${secret}`,
        'Content-Type':'application/x-www-form-urlencoded',
        'Idempotency-Key':`return-${item.id}`,
      },
      body,
    }).then(parse);

    await recordRefund(base,service,item.id,refund);

    const completed=refund.status==='succeeded';
    return res.status(completed?200:202).json({
      completed,
      provider:'stripe',
      reference:refund.id,
      status:refund.status,
      amount:Number(refund.amount||amount)/100,
    });
  }catch(error){
    return res.status(error.statusCode||500).json({message:error.message});
  }
}
