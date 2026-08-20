export function isAuthorizedCron(headers, secret) {
  if (!secret) return false;
  const authorization = headers?.authorization || headers?.Authorization || '';
  return authorization === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ message:'Método não permitido' });
  if (!isAuthorizedCron(req.headers, process.env.CRON_SECRET)) return res.status(401).json({ message:'Agendamento não autorizado' });
  const base = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !service) return res.status(503).json({ message:'Supabase não configurado' });
  try {
    const response = await fetch(`${base}/rest/v1/rpc/expire_pending_orders`, {
      method:'POST',
      headers:{ apikey:service, Authorization:`Bearer ${service}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ p_limit:200 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Falha ao expirar pedidos pendentes');
    return res.json({ ok:true, expired:Number(data || 0), executed_at:new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message:error.message });
  }
}
