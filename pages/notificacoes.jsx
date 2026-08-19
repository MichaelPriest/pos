import { useEffect, useMemo, useState } from 'react';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import AuthGuard from '../components/AuthGuard';
import StoreBrand from '../components/StoreBrand';
import { db } from '../lib/supabase';

export default function Notifications() {
  const [items,setItems] = useState([]);
  const [filter,setFilter] = useState('todas');
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');
  const load = () => db.notifications().then(setItems).catch(error=>setNotice(error.message)).finally(()=>setLoading(false));
  useEffect(()=>{load()},[]);
  const shown = useMemo(()=>filter==='nao_lidas'?items.filter(item=>!item.read_at):items,[items,filter]);
  const mark = async id => { await db.markNotificationsRead(id);load(); };
  const markAll = async () => { await db.markNotificationsRead();setNotice('Todas as notificações foram marcadas como lidas.');load(); };

  return <AuthGuard roles={['customer']}><Head><title>Notificações | ReVeste</title></Head><main className="notifications-page">
    <header><Link href="/loja"><StoreBrand/></Link><Link href="/minha-conta">Minha conta →</Link></header>
    <section className="notifications-shell"><div className="notifications-title"><div><p>ATUALIZAÇÕES DA SUA CONTA</p><h1>Notificações</h1><span>Acompanhe pagamentos, preparação e entrega dos seus pedidos.</span></div><button onClick={markAll} disabled={!items.some(item=>!item.read_at)}>Marcar todas como lidas</button></div>
      <nav><button className={filter==='todas'?'active':''} onClick={()=>setFilter('todas')}>Todas <b>{items.length}</b></button><button className={filter==='nao_lidas'?'active':''} onClick={()=>setFilter('nao_lidas')}>Não lidas <b>{items.filter(item=>!item.read_at).length}</b></button></nav>
      {notice&&<div className="account-notice">{notice}</div>}{loading?<div className="route-loading"><i/><p>Carregando atualizações...</p></div>:shown.length?<div className="notification-list">{shown.map(item=><article className={item.read_at?'':'unread'} key={item.id}><i>{item.type==='tracking'?'⌁':'✓'}</i><div><small>{new Date(item.created_at).toLocaleString('pt-BR')}</small><h2>{item.title}</h2><p>{item.message}</p>{item.order_id&&<Link href={`/minha-conta?pedido=${item.order_id}`}>Ver pedido →</Link>}</div>{!item.read_at&&<button onClick={()=>mark(item.id)}>Marcar como lida</button>}</article>)}</div>:<div className="account-empty"><span>✓</span><h3>Tudo em dia</h3><p>Você não possui notificações neste filtro.</p><Link href="/loja">Continuar comprando →</Link></div>}
    </section>
  </main></AuthGuard>;
}
