import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import StoreBrand from '../../components/StoreBrand';

const groups = [
  { label:'Visão geral', icon:'🏠', open:true, links:[['/admin','🏠','Painel']] },
  { label:'Comercial', open:false, icon:'🛍️', links:[['/admin?tab=Produtos','📦','Produtos'],['/admin?tab=Estoque','🏷️','Estoque'],['/admin?tab=Pedidos','🧾','Pedidos'],['/admin?tab=Logística','🚚','Logística'],['/admin?tab=Cupons','🎟️','Cupons']] },
  { label:'Operação', open:false, icon:'⚙️', links:[['/pdv','🛒','Frente de caixa'],['/caixa','💵','Controle de caixa'],['/financeiro','💳','Financeiro'],['/relatorios','📊','Relatórios']] },
  { label:'Pessoas', open:false, icon:'👥', links:[['/admin?tab=Clientes','👤','Clientes'],['/admin?tab=Doações','💚','Doações'],['/equipe','🧑‍💼','Funcionários'],['/rh','🗂️','RH'],['/ponto','⏱️','Ponto eletrônico']] },
  { label:'Administração', open:false, icon:'🛡️', links:[['/admin?tab=Integrações','🔌','Integrações'],['/auditoria','🛡️','Auditoria'],['/configuracoes','⚙️','Configurações']] },
];
const primaryMobileLinks=[groups[0].links[0],groups[1].links[0],groups[1].links[2],groups[2].links[0]];

export default function SystemLayout(){
  const location=useLocation(),[mobileMenu,setMobileMenu]=useState(false);
  const isCurrent=to=>`${location.pathname}${location.search}`===to;
  const shortcut=([to,icon,label],className='')=><NavLink key={to} to={to} onClick={()=>setMobileMenu(false)} className={`${isCurrent(to)?'active ':''}${className}`.trim()}><i>{icon}</i><span>{label}</span></NavLink>;
  return <div className="system-layout">
    <aside className="system-sidebar"><NavLink to="/admin"><StoreBrand/></NavLink><p>ÁREA RESTRITA</p><nav aria-label="Módulos do sistema">{groups.map(group=><details key={group.label} open={group.open||group.links.some(([to])=>isCurrent(to))||undefined}><summary><i>{group.icon}</i><span>{group.label}</span></summary>{group.links.map(link=>shortcut(link))}</details>)}</nav><div className="system-sidebar-bottom"><NavLink to="/loja">↗ <span>Ver loja online</span></NavLink><NavLink to="/perfil">👤 <span>Meu perfil</span></NavLink></div></aside>
    <div className="system-workspace"><Outlet/></div>
    <nav className="system-mobile-shortcuts" aria-label="Atalhos principais">{primaryMobileLinks.map(link=>shortcut(link))}<button type="button" aria-expanded={mobileMenu} aria-controls="mobile-page-menu" onClick={()=>setMobileMenu(open=>!open)}><i>{mobileMenu?'×':'☰'}</i><span>Mais</span></button></nav>
    {mobileMenu&&<div className="mobile-page-overlay" onClick={()=>setMobileMenu(false)}><section id="mobile-page-menu" role="dialog" aria-modal="true" aria-labelledby="mobile-page-title" onClick={event=>event.stopPropagation()}><header><div><small>NAVEGAÇÃO</small><h2 id="mobile-page-title">Atalhos das páginas</h2></div><button type="button" aria-label="Fechar atalhos" onClick={()=>setMobileMenu(false)}>×</button></header>{groups.map(group=><div className="mobile-page-group" key={group.label}><h3>{group.icon} {group.label}</h3><div>{group.links.map(link=>shortcut(link))}</div></div>)}<div className="mobile-page-extra">{shortcut(['/loja','↗','Ver loja'])}{shortcut(['/perfil','👤','Meu perfil'])}</div></section></div>}
  </div>;
}
