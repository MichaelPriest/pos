import { useEffect, useState } from 'react';
import Link from '../src/shims/Link';
import StoreBrand from './StoreBrand';
import SystemIcon from './SystemIcon';
import { auth, getSession } from '../lib/supabase';

export default function CommerceHeader({cartCount,onCart,compact=false}){
  const signedIn=Boolean(getSession());
  const [teamRole,setTeamRole]=useState(null);
  useEffect(()=>{let active=true;if(signedIn)auth.profile().then(p=>{if(active)setTeamRole(p?.role||null)}).catch(()=>{});return()=>{active=false}},[signedIn]);
  const teamAccess=['admin','manager'].includes(teamRole)?'/admin':teamRole==='cashier'?'/pdv':teamRole&&teamRole!=='customer'?'/perfil':'/login?next=/admin';
  const [search,setSearch]=useState(''),[localCartCount,setLocalCartCount]=useState(()=>{try{return JSON.parse(localStorage.getItem('reveste_cart')||'[]').length}catch{return 0}});
  useEffect(()=>{const refresh=()=>{try{setLocalCartCount(JSON.parse(localStorage.getItem('reveste_cart')||'[]').length)}catch{setLocalCartCount(0)}};window.addEventListener('cart:updated',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('cart:updated',refresh);window.removeEventListener('storage',refresh)}},[]);
  const submit=event=>{event.preventDefault();const term=search.trim();location.href=term?'/loja?busca='+encodeURIComponent(term):'/loja#catalogo'};
  const count=Number.isFinite(cartCount)?cartCount:localCartCount;
  return <><div className="commerce-topbar"><span>Moda circular com curadoria</span><b>Compra segura · Peças únicas</b><span>Envio para todo Brasil</span></div>
    <header className={compact?'commerce-header compact':'commerce-header'}>
      <Link href="/loja" className="commerce-brand-link"><StoreBrand/></Link>
      <nav aria-label="Navegação da loja"><Link href="/loja#catalogo">Comprar</Link><Link href="/favoritos">Favoritos</Link><Link href="/doar">Vender / Doar</Link><Link href="/trocas-e-devolucoes">Trocas</Link></nav>
      <form className="commerce-search" onSubmit={submit}><SystemIcon name="search"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar peças, marcas..." aria-label="Buscar na loja"/><button type="submit" aria-label="Buscar"><SystemIcon name="external"/></button></form>
      <div className="commerce-actions">
        <Link href={signedIn?'/favoritos':'/login?next=/favoritos'} aria-label="Favoritos"><SystemIcon name="heart"/></Link>
        <Link href={signedIn?'/notificacoes':'/login?next=/notificacoes'} aria-label="Notificações"><SystemIcon name="bell"/></Link>
        <Link href={signedIn?'/minha-conta':'/login'} aria-label={signedIn?'Minha conta':'Entrar'}><SystemIcon name="user"/></Link>
        <Link href={teamAccess} className="commerce-team-entry" aria-label={teamRole&&teamRole!=='customer'?'Abrir painel da equipe':'Entrar na área administrativa'}><SystemIcon name="settings"/><span>{teamRole&&teamRole!=='customer'?'Painel da equipe':'Acesso Admin'}</span></Link>
        {onCart?<button className="commerce-bag" onClick={onCart} aria-label={'Abrir sacola com '+count+' item(ns)'}><SystemIcon name="bag"/><span>Sacola</span>{count>0&&<b>{count}</b>}</button>:<Link href="/loja" className="commerce-bag"><SystemIcon name="bag"/><span>Sacola</span>{count>0&&<b>{count}</b>}</Link>}
      </div>
    </header></>;
}
