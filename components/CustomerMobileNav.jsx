import { NavLink, useLocation } from 'react-router-dom';
import { getSession } from '../lib/supabase';

const systemPaths=['/admin','/pdv','/caixa','/financeiro','/relatorios','/equipe','/rh','/ponto','/auditoria','/perfil','/funcionario'];
const hiddenPaths=['/login','/checkout','/esqueci-senha','/redefinir-senha','/comprovante','/etiqueta','/403'];

export default function CustomerMobileNav(){
  const {pathname}=useLocation(),signedIn=Boolean(getSession());
  if(systemPaths.some(path=>pathname===path||pathname.startsWith(`${path}/`))||hiddenPaths.some(path=>pathname===path||pathname.startsWith(`${path}/`)))return null;
  const links=[
    ['/loja','⌂','Loja',pathname==='/loja'||pathname.startsWith('/produto/')],
    [signedIn?'/favoritos':'/login?next=/favoritos','♡','Favoritos'],
    ['/doar','♻','Doar'],
    [signedIn?'/notificacoes':'/login?next=/notificacoes','♢','Avisos'],
    [signedIn?'/minha-conta':'/login','♙','Conta'],
  ];
  return <nav className="customer-mobile-nav" aria-label="Atalhos da loja">{links.map(([to,icon,label,active])=><NavLink key={label} to={to} className={active||pathname===to.split('?')[0]?'active':''}><i>{icon}</i><span>{label}</span></NavLink>)}</nav>;
}
