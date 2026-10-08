import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Link from '../src/shims/Link';
import CommerceHeader from './CommerceHeader';
import CommerceFooter from './CommerceFooter';
import SystemIcon from './SystemIcon';
import { auth, db } from '../lib/supabase';

const navigation=[
  {href:'/minha-conta',match:'/minha-conta',icon:'home',label:'Visão geral'},
  {href:'/minha-conta?secao=pedidos',match:'secao=pedidos',icon:'box',label:'Meus pedidos'},
  {href:'/favoritos',match:'/favoritos',icon:'heart',label:'Favoritos'},
  {href:'/notificacoes',match:'/notificacoes',icon:'bell',label:'Notificações',badge:true},
  {href:'/minha-conta?secao=enderecos',match:'secao=enderecos',icon:'pin',label:'Endereços'},
  {href:'/minha-conta?secao=trocas',match:'secao=trocas',icon:'cycle',label:'Trocas e devoluções'},
  {href:'/minha-conta?secao=circularidade',match:'secao=circularidade',icon:'cycle',label:'Circularidade'},
  {href:'/minha-conta?secao=dados',match:'secao=dados',icon:'user',label:'Meus dados'},
];

export default function CustomerPortalShell({title,eyebrow='MINHA CONTA',subtitle,actions,children,className=''}) {
  const location=useLocation();
  const [profile,setProfile]=useState(null),[unread,setUnread]=useState(0);

  useEffect(()=>{
    Promise.all([auth.profile(),db.unreadNotificationsCount()]).then(([person,count])=>{setProfile(person);setUnread(count)}).catch(()=>{});
    const refresh=()=>db.unreadNotificationsCount().then(setUnread).catch(()=>{});
    const changed=event=>Number.isInteger(event.detail?.unread)?setUnread(event.detail.unread):refresh();
    window.addEventListener('notifications:updated',changed);
    return()=>window.removeEventListener('notifications:updated',changed);
  },[]);

  const current=`${location.pathname}${location.search}`;
  const isActive=item=>item.href==='/minha-conta'
    ? location.pathname==='/minha-conta'&&!location.search
    : item.match.startsWith('/')?location.pathname===item.match:current.includes(item.match);

  const initials=profile?.name?.split(' ').filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'CL';

  return <main className={`customer-portal ${className}`.trim()}>
    <CommerceHeader/>
    <section className="customer-portal-wrap">
      <aside className="customer-portal-sidebar">
        <div className="customer-portal-profile">
          <div className="customer-portal-avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt=""/>:<span>{initials}</span>}</div>
          <div><small>CONTA REVESTE</small><strong>{profile?.name||'Cliente'}</strong><span>{profile?.email||''}</span></div>
        </div>
        <nav aria-label="Área do cliente">{navigation.map(item=><Link key={item.href} href={item.href} className={isActive(item)?'active':''}><SystemIcon name={item.icon}/><span>{item.label}</span>{item.badge&&unread>0&&<b>{unread>99?'99+':unread}</b>}</Link>)}</nav>
        <div className="customer-portal-help">
          <SystemIcon name="shield"/>
          <div><b>Precisa de ajuda?</b><span>Acompanhe seus pedidos ou consulte nossa política de trocas.</span><Link href="/trocas-e-devolucoes">Central de ajuda →</Link></div>
        </div>
        <button className="customer-portal-signout" onClick={async()=>{await auth.signOut();location.href='/login'}}><SystemIcon name="logout"/> Sair da conta</button>
      </aside>
      <div className="customer-portal-content">
        <header className="customer-portal-title">
          <div><p>{eyebrow}</p><h1>{title}</h1>{subtitle&&<span>{subtitle}</span>}</div>
          {actions&&<div className="customer-portal-title-actions">{actions}</div>}
        </header>
        {children}
      </div>
    </section>
    <CommerceFooter/>
  </main>;
}
