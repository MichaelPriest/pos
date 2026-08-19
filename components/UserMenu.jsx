import Link from '../src/shims/Link';
import { useEffect, useState } from 'react';
import { auth, db, getSession, storage } from '../lib/supabase';

export default function UserMenu() {
  const [profile,setProfile]=useState(null),[open,setOpen]=useState(false);
  useEffect(()=>{if(getSession())auth.profile().then(setProfile).catch(()=>{})},[]);
  if(!profile)return null;
  const upload=async event=>{const file=event.target.files[0];if(!file)return;try{const avatar_url=await storage.uploadImage('avatars',file,'profile',1024*1024);await db.updateProfile(profile.id,{avatar_url});setProfile({...profile,avatar_url})}catch(error){alert(error.message)}};
  const employee=profile.role!=='customer';
  return <div className="user-menu"><button onClick={()=>setOpen(!open)}>{profile.avatar_url?<img src={profile.avatar_url} alt="Foto do perfil"/>:<span>{profile.name?.slice(0,2).toUpperCase()||'US'}</span>}<i>⌄</i></button>{open&&<div className="user-popover"><header>{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:<span>{profile.name?.slice(0,2).toUpperCase()}</span>}<div><strong>{profile.name}</strong><small>{profile.email}</small><em>{employee?'Equipe · '+profile.role:'Cliente'}</em></div></header><label>📷 Alterar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label><Link href={employee?'/perfil':'/minha-conta'}>👤 {employee?'Meu perfil profissional':'Minha conta'}</Link>{!employee&&<Link href="/notificacoes">🔔 Notificações</Link>}{employee&&<Link href={profile.role==='cashier'?'/pdv':'/admin'}>⚙️ Área restrita</Link>}<button onClick={()=>{auth.signOut();location.href='/login'}}>↪ Sair da conta</button></div>}</div>;
}
