import { NavLink, Outlet, useLocation } from 'react-router-dom';
import StoreBrand from '../../components/StoreBrand';

const groups = [
  { label:'Visão geral', icon:'🏠', open:true, links:[['/admin','🏠','Painel']] },
  { label:'Comercial', icon:'🛍️', open:false, links:[['/admin?tab=Produtos','📦','Produtos'],['/admin?tab=Estoque','🏷️','Estoque'],['/admin?tab=Pedidos','🧾','Pedidos'],['/admin?tab=Logística','🚚','Logística'],['/admin?tab=Cupons','🎟️','Cupons']] },
  { label:'Operação', icon:'⚙️', open:false, links:[['/pdv','🛒','Frente de caixa'],['/caixa','💵','Controle de caixa'],['/financeiro','💳','Financeiro'],['/relatorios','📊','Relatórios']] },
  { label:'Pessoas', icon:'👥', open:false, links:[['/admin?tab=Clientes','👤','Clientes'],['/admin?tab=Doações','💚','Doações'],['/equipe','🧑‍💼','Funcionários'],['/rh','🗂️','RH'],['/ponto','⏱️','Ponto eletrônico']] },
  { label:'Administração', icon:'🛡️', open:false, links:[['/auditoria','🛡️','Auditoria'],['/configuracoes','⚙️','Configurações']] },
];

export default function SystemLayout(){
  const location=useLocation();
  const isCurrent=to=>`${location.pathname}${location.search}`===to;
  return <div className="system-layout"><aside className="system-sidebar"><NavLink to="/admin"><StoreBrand/></NavLink><p>ÁREA RESTRITA</p><nav aria-label="Módulos do sistema">{groups.map(group=><details key={group.label} open={group.open||group.links.some(([to])=>isCurrent(to))||undefined}><summary><i>{group.icon}</i><span>{group.label}</span></summary>{group.links.map(([to,icon,label])=><NavLink key={to} to={to} className={isCurrent(to)?'active':''}><i>{icon}</i><span>{label}</span></NavLink>)}</details>)}</nav><div className="system-sidebar-bottom"><NavLink to="/loja">↗ <span>Ver loja online</span></NavLink><NavLink to="/perfil">👤 <span>Meu perfil</span></NavLink></div></aside><div className="system-workspace"><Outlet/></div></div>;
}
