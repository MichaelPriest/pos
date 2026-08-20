import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import StoreBrand from '../../components/StoreBrand';
import { auth, db, getSession } from '../../lib/supabase';

const groups = [
  { label:'Visão geral', icon:'⌂', open:true, links:[['/admin','⌂','Painel']] },
  { label:'Comercial', icon:'◇', open:false, links:[['/admin?tab=Produtos','◇','Produtos'],['/admin?tab=Estoque','▤','Estoque'],['/admin?tab=Pedidos','▣','Vendas'],['/admin?tab=Clientes','♙','Clientes'],['/admin?tab=Cupons','⌁','Cupons']] },
  { label:'Operação', icon:'▦', open:false, links:[['/pdv','＋','Frente de caixa'],['/caixa','$','Controle de caixa'],['/financeiro','◫','Financeiro'],['/relatorios','⌁','Relatórios'],['/admin?tab=Logística','→','Logística']] },
  { label:'Pessoas', icon:'♙', open:false, links:[['/admin?tab=Doações','♡','Doações'],['/equipe','♙','Funcionários'],['/rh','▤','RH'],['/ponto','◷','Ponto eletrônico']] },
  { label:'Administração', icon:'⚙', open:false, links:[['/auditoria','♢','Auditoria'],['/configuracoes','⚙','Configurações']] },
];

const initials = value => String(value || 'ReVeste').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();

export default function SystemLayout(){
  const location=useLocation(), navigate=useNavigate();
  const [search,setSearch]=useState(''), [menuOpen,setMenuOpen]=useState(false), [settings,setSettings]=useState({store_name:'ReVeste'}), [profile,setProfile]=useState(null);
  useEffect(()=>{Promise.all([db.settings(),auth.profile()]).then(([store,user])=>{if(store)setSettings(store);if(user)setProfile(user)}).catch(()=>{})},[]);
  const sessionUser=getSession()?.user;
  const person=profile?.name||sessionUser?.user_metadata?.name||sessionUser?.email||'Administrador';
  const email=profile?.email||sessionUser?.email||'Gestão da loja';
  const isCurrent=to=>`${location.pathname}${location.search}`===to || (to==='/admin'&&location.pathname==='/admin'&&!location.search);
  const submitSearch=event=>{event.preventDefault();const query=search.trim();if(query)navigate(`/admin?tab=Produtos&search=${encodeURIComponent(query)}`)};
  return <div className="system-layout">
    <aside className={`system-sidebar${menuOpen?' open':''}`}>
      <NavLink className="system-brand" to="/admin"><StoreBrand/></NavLink>
      <div className="system-store-card"><span>{initials(settings.store_name)}</span><div><strong>{settings.store_name||'ReVeste'}</strong><small>{settings.tagline||'Gestão completa do brechó'}</small></div><i>⌄</i></div>
      <p>MENU PRINCIPAL</p>
      <nav aria-label="Módulos do sistema">{groups.map(group=><details key={group.label} open={group.open||group.links.some(([to])=>isCurrent(to))||undefined}><summary><i>{group.icon}</i><span>{group.label}</span><b>⌄</b></summary>{group.links.map(([to,icon,label])=><NavLink key={to} to={to} className={isCurrent(to)?'active':''}><i>{icon}</i><span>{label}</span></NavLink>)}</details>)}</nav>
      <div className="system-online-card"><span>✦</span><strong>Sua loja, sempre ativa</strong><p>Acompanhe vendas e estoque em um só lugar.</p><NavLink to="/loja">Ver loja online →</NavLink></div>
      <div className="system-profile"><span>{initials(person)}</span><div><strong>{person}</strong><small>{email}</small></div><NavLink aria-label="Abrir perfil" to="/perfil">•••</NavLink></div>
    </aside>
    <div className="system-workspace">
      <header className="system-topbar"><button className="system-mobile-toggle" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>☰</button><form className="system-global-search" onSubmit={submitSearch}><span>⌕</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar produtos, clientes ou vendas..."/><kbd>Enter</kbd></form><NavLink className="system-notification" aria-label="Notificações" to="/notificacoes">♢<i/></NavLink><NavLink className="system-new-sale" to="/pdv"><b>＋</b> Nova venda</NavLink></header>
      <Outlet/>
    </div>
  </div>;
}
