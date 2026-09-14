import Link from '../src/shims/Link';
import { useEffect, useRef, useState } from 'react';
import { auth, db, getSession, storage } from '../lib/supabase';

export default function UserMenu() {
  const [profile,setProfile]=useState(null),[open,setOpen]=useState(false),[unread,setUnread]=useState(0);
  const menuRef=useRef(null);
  useEffect(()=>{if(getSession())auth.profile().then(setProfile).catch(()=>{})},[]);
  useEffect(()=>{
    if(profile?.role!=='customer')return;
    const refresh=()=>db.unreadNotificationsCount().then(setUnread).catch(()=>{});
    const onUpdated=event=>{
      if(Number.isInteger(event.detail?.unread))setUnread(event.detail.unread);
      else if(Number.isInteger(event.detail?.delta))setUnread(current=>Math.max(0,current+event.detail.delta));
      else refresh();
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')refresh()};
    refresh();
    window.addEventListener('focus',refresh);
    window.addEventListener('notifications:updated',onUpdated);
    document.addEventListener('visibilitychange',onVisibility);
    const interval=window.setInterval(refresh,60000);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('notifications:updated',onUpdated);document.removeEventListener('visibilitychange',onVisibility);window.clearInterval(interval)};
  },[profile?.role]);
  useEffect(()=>{
    if(!open)return;
    const close=event=>{if(event.key==='Escape'||!menuRef.current?.contains(event.target))setOpen(false)};
    document.addEventListener('keydown',close);
    document.addEventListener('pointerdown',close);
    return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close)};
  },[open]);
  if(!profile)return null;
  const upload=async event=>{const file=event.target.files[0];if(!file)return;try{const avatar_url=await storage.uploadImage('avatars',file,'profile',1024*1024);await db.updateProfile(profile.id,{avatar_url});setProfile({...profile,avatar_url})}catch(error){alert(error.message)}};
  const employee=profile.role!=='customer';
  return <div className="user-menu" ref={menuRef}><button aria-label="Abrir menu do usuário" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}>{profile.avatar_url?<img src={profile.avatar_url} alt="Foto do perfil"/>:<span>{profile.name?.slice(0,2).toUpperCase()||'US'}</span>}{!employee&&unread>0&&<b className="user-notification-badge" aria-label={`${unread} notificações não lidas`}>{unread>99?'99+':unread}</b>}<i aria-hidden="true">⌄</i></button>{open&&<div className="user-popover" role="menu" onClick={event=>{if(event.target.closest('a'))setOpen(false)}}><header>{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:<span>{profile.name?.slice(0,2).toUpperCase()}</span>}<div><strong>{profile.name}</strong><small>{profile.email}</small><em>{employee?'Equipe · '+profile.role:'Cliente'}</em></div></header><label>📷 Alterar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label><Link href={employee?'/perfil':'/minha-conta'} role="menuitem">👤 {employee?'Meu perfil profissional':'Minha conta'}</Link>{!employee&&<Link href="/notificacoes" role="menuitem">🔔 Notificações {unread>0&&<b>{unread} não {unread===1?'lida':'lidas'}</b>}</Link>}{employee&&<Link href={profile.role==='cashier'?'/pdv':'/admin'} role="menuitem">⚙️ Área restrita</Link>}<button role="menuitem" onClick={()=>{auth.signOut();location.href='/login'}}>↪ Sair da conta</button></div>}</div>;
}
