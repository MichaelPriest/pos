import { NavLink, useLocation } from 'react-router-dom';
import { getSession } from '../lib/supabase';

const systemPaths=['/admin','/entradas','/consignantes','/trocas','/pdv','/caixa','/financeiro','/relatorios','/equipe','/rh','/ponto','/auditoria','/perfil','/funcionario'];
const hiddenPaths=['/login','/checkout','/esqueci-senha','/redefinir-senha','/comprovante','/etiqueta','/etiqueta-peca','/403'];

const icons={
  store:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 5.2 4h13.6l2.2 6.5M4.5 10.5V20h15v-9.5M9 20v-6h6v6M3 10.5c.3 1.5 1.4 2.3 2.7 2.3 1.4 0 2.3-.8 2.7-2.3.4 1.5 1.4 2.3 2.8 2.3s2.4-.8 2.8-2.3c.3 1.5 1.3 2.3 2.7 2.3 1.3 0 2.4-.8 2.8-2.3"/></svg>,
  heart:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/></svg>,
  donate:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-3.7-7-9.4A4.6 4.6 0 0 1 13 8.5 4.6 4.6 0 0 1 21 11.6C21 17.3 12 21 12 21Z"/><path d="M12 8V3m0 0L9.5 5.5M12 3l2.5 2.5"/></svg>,
  bell:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>,
  account:<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.3 3.4-6.5 8-6.5s7.2 2.2 8 6.5"/></svg>,
};

export default function CustomerMobileNav(){
  const {pathname}=useLocation();
  const signedIn=Boolean(getSession());
  if(systemPaths.some(path=>pathname===path||pathname.startsWith(`${path}/`))||hiddenPaths.some(path=>pathname===path||pathname.startsWith(`${path}/`)))return null;

  const links=[
    {to:'/loja',icon:'store',label:'Loja',active:pathname==='/loja'||pathname.startsWith('/produto/')},
    {to:signedIn?'/favoritos':'/login?next=/favoritos',icon:'heart',label:'Favoritos',active:pathname==='/favoritos'},
    {to:signedIn?'/doar':'/login?next=/doar',icon:'donate',label:'Doar',active:pathname==='/doar'},
    {to:signedIn?'/notificacoes':'/login?next=/notificacoes',icon:'bell',label:'Avisos',active:pathname==='/notificacoes'},
    {to:signedIn?'/minha-conta':'/login',icon:'account',label:'Conta',active:pathname==='/minha-conta'},
  ];

  return <nav className="customer-mobile-nav" aria-label="Atalhos da loja">{links.map(item=><NavLink key={item.label} to={item.to} className={item.active?'active':''} aria-current={item.active?'page':undefined}>{icons[item.icon]}<span>{item.label}</span></NavLink>)}</nav>;
}
