import { useEffect, useMemo, useState } from 'react';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import AuthGuard from '../components/AuthGuard';
import StoreBrand from '../components/StoreBrand';
import { db } from '../lib/supabase';

const PAGE_SIZE = 20;

export default function Notifications() {
  const [items,setItems] = useState([]);
  const [filter,setFilter] = useState('todas');
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');
  const [marking,setMarking] = useState(null);
  const [loadingMore,setLoadingMore] = useState(false);
  const [hasMore,setHasMore] = useState(false);
  const load = () => db.notifications({limit:PAGE_SIZE}).then(rows=>{setItems(rows);setHasMore(rows.length===PAGE_SIZE)}).catch(error=>setNotice(error.message)).finally(()=>setLoading(false));
  useEffect(()=>{load()},[]);
  const shown = useMemo(()=>filter==='nao_lidas'?items.filter(item=>!item.read_at):items,[items,filter]);
  const loadMore = async () => { setLoadingMore(true);setNotice('');try{const rows=await db.notifications({limit:PAGE_SIZE,offset:items.length});setItems(current=>[...current,...rows.filter(row=>!current.some(item=>item.id===row.id))]);setHasMore(rows.length===PAGE_SIZE)}catch(error){setNotice(error.message)}finally{setLoadingMore(false)} };
  const updateCounter = detail => window.dispatchEvent(new CustomEvent('notifications:updated',{detail}));
  const mark = async id => { setMarking(id);setNotice('');try{const changed=await db.markNotificationsRead(id);setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item));updateCounter({delta:-Number(changed||0)})}catch(error){setNotice(error.message)}finally{setMarking(null)} };
  const markAll = async () => { setMarking('all');setNotice('');try{await db.markNotificationsRead();setItems(current=>current.map(item=>({...item,read_at:item.read_at||new Date().toISOString()})));setNotice('Todas as notificações foram marcadas como lidas.');updateCounter({unread:0})}catch(error){setNotice(error.message)}finally{setMarking(null)} };

  return <AuthGuard roles={['customer']}><Head><title>Notificações | ReVeste</title></Head><main className="notifications-page">
    <header><Link href="/loja"><StoreBrand/></Link><Link href="/minha-conta">Minha conta →</Link></header>
    <section className="notifications-shell"><div className="notifications-title"><div><p>ATUALIZAÇÕES DA SUA CONTA</p><h1>Notificações</h1><span>Acompanhe pagamentos, preparação e entrega dos seus pedidos.</span></div><button onClick={markAll} disabled={Boolean(marking)||!items.some(item=>!item.read_at)}>{marking==='all'?'Marcando...':'Marcar todas como lidas'}</button></div>
      <nav aria-label="Filtrar notificações"><button aria-pressed={filter==='todas'} className={filter==='todas'?'active':''} onClick={()=>setFilter('todas')}>Todas <b>{items.length}</b></button><button aria-pressed={filter==='nao_lidas'} className={filter==='nao_lidas'?'active':''} onClick={()=>setFilter('nao_lidas')}>Não lidas <b>{items.filter(item=>!item.read_at).length}</b></button></nav>
      {notice&&<div className="account-notice" role="status" aria-live="polite">{notice}</div>}{loading?<div className="route-loading"><i/><p>Carregando atualizações...</p></div>:shown.length?<div className="notification-list">{shown.map(item=><article className={item.read_at?'':'unread'} key={item.id}><i>{item.type==='tracking'?'⌁':'✓'}</i><div><small>{new Date(item.created_at).toLocaleString('pt-BR')}</small><h2>{item.title}</h2><p>{item.message}</p>{item.order_id&&<Link href={`/minha-conta?pedido=${item.order_id}`}>Ver pedido →</Link>}</div>{!item.read_at&&<button disabled={Boolean(marking)} onClick={()=>mark(item.id)}>{marking===item.id?'Marcando...':'Marcar como lida'}</button>}</article>)}</div>:<div className="account-empty"><span>✓</span><h3>Tudo em dia</h3><p>Você não possui notificações neste filtro.</p><Link href="/loja">Continuar comprando →</Link></div>}
      {!loading&&hasMore&&<button className="notifications-more" disabled={loadingMore} onClick={loadMore}>{loadingMore?'Carregando...':'Carregar notificações anteriores'}</button>}
    </section>
  </main></AuthGuard>;
}
