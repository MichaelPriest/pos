import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import StoreBrand from '../../components/StoreBrand';
import { auth, db, getSession } from '../../lib/supabase';
import Icon from './Icon';

const groups = [
  { label:'Visão geral', icon:'home', open:true, links:[['/admin','home','Painel']] },
  { label:'Comercial', icon:'products', open:false, links:[['/admin?tab=Produtos','products','Produtos'],['/admin?tab=Estoque','stock','Estoque'],['/admin?tab=Pedidos','sales','Vendas'],['/admin?tab=Clientes','customers','Clientes'],['/admin?tab=Cupons','coupon','Cupons']] },
  { label:'Operação', icon:'pos', open:false, links:[['/pdv','pos','Frente de caixa'],['/caixa','cash','Controle de caixa'],['/financeiro','finance','Financeiro'],['/relatorios','reports','Relatórios'],['/admin?tab=Logística','logistics','Logística']] },
  { label:'Pessoas', icon:'people', open:false, links:[['/admin?tab=Doações','heart','Doações'],['/equipe','people','Funcionários'],['/rh','stock','RH'],['/ponto','clock','Ponto eletrônico']] },
  { label:'Administração', icon:'shield', open:false, links:[['/auditoria','shield','Auditoria'],['/configuracoes','settings','Configurações']] },
];
const initials=value=>String(value||'ReVeste').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();

export default function SystemLayout(){
  const location=useLocation(),navigate=useNavigate();
  const [search,setSearch]=useState(''),[menuOpen,setMenuOpen]=useState(false),[collapsed,setCollapsed]=useState(false),[settings,setSettings]=useState({store_name:'ReVeste'}),[profile,setProfile]=useState(null);
  useEffect(()=>{Promise.all([db.settings(),auth.profile()]).then(([store,user])=>{if(store)setSettings(store);if(user)setProfile(user)}).catch(()=>{})},[]);
  useEffect(()=>setMenuOpen(false),[location.pathname,location.search]);
  const sessionUser=getSession()?.user,person=profile?.name||sessionUser?.user_metadata?.name||sessionUser?.email||'Administrador',email=profile?.email||sessionUser?.email||'Gestão da loja';
  const isCurrent=to=>`${location.pathname}${location.search}`===to||(to==='/admin'&&location.pathname==='/admin'&&!location.search);
  const submitSearch=event=>{event.preventDefault();const query=search.trim();if(query)navigate(`/admin?tab=Produtos&search=${encodeURIComponent(query)}`)};
  return <div className={`system-layout${collapsed?' sidebar-collapsed':''}`}>
    {menuOpen&&<button className="sidebar-backdrop" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}/>}
    <aside className={`system-sidebar${menuOpen?' open':''}`}>
      <div className="sidebar-brand-row"><NavLink className="system-brand" to="/admin"><StoreBrand/></NavLink><button className="sidebar-collapse" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expandir menu':'Recolher menu'}><Icon name="chevron" size={15}/></button></div>
      <div className="system-store-card"><span>{initials(settings.store_name)}</span><div><strong>{settings.store_name||'ReVeste'}</strong><small>{settings.tagline||'Gestão completa do brechó'}</small></div><i>⌄</i></div>
      <p>MENU PRINCIPAL</p>
      <nav aria-label="Módulos do sistema">{groups.map(group=><details key={group.label} open={group.open||group.links.some(([to])=>isCurrent(to))||undefined}><summary title={group.label}><Icon name={group.icon}/><span>{group.label}</span><Icon name="chevron" size={13} className="group-arrow"/></summary>{group.links.map(([to,icon,label])=><NavLink key={to} to={to} title={label} className={isCurrent(to)?'active':''}><Icon name={icon}/><span>{label}</span></NavLink>)}</details>)}</nav>
      <div className="system-online-card"><span>✦</span><strong>Sua loja, sempre ativa</strong><p>Acompanhe vendas e estoque em um só lugar.</p><NavLink to="/loja">Ver loja online →</NavLink></div>
      <div className="system-profile"><span>{initials(person)}</span><div><strong>{person}</strong><small>{email}</small></div><NavLink aria-label="Abrir perfil" to="/perfil">•••</NavLink></div>
    </aside>
    <div className="system-workspace"><header className="system-topbar"><button className="system-mobile-toggle" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}><Icon name="menu"/></button><form className="system-global-search" onSubmit={submitSearch}><Icon name="search"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar produtos, clientes ou vendas..."/><kbd>Enter</kbd></form><NavLink className="system-notification" aria-label="Notificações" to="/notificacoes"><Icon name="bell"/><i/></NavLink><NavLink className="system-new-sale" to="/pdv"><Icon name="plus"/><span>Nova venda</span></NavLink></header><Outlet/></div>
  </div>;
}
