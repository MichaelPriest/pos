import Link from 'next/link';
import { useEffect, useState } from 'react';
import { auth, db, getSession } from '../lib/supabase';

export default function UserMenu() {
  const [profile,setProfile]=useState(null),[open,setOpen]=useState(false);
  useEffect(()=>{if(getSession())auth.profile().then(setProfile).catch(()=>{})},[]);
  if(!profile)return null;
  const upload=event=>{const file=event.target.files[0];if(!file)return;if(file.size>1024*1024)return alert('Use uma foto de até 1 MB.');const reader=new FileReader();reader.onload=async()=>{await db.updateProfile(profile.id,{avatar_url:reader.result});setProfile({...profile,avatar_url:reader.result})};reader.readAsDataURL(file)};
  return <div className="user-menu"><button onClick={()=>setOpen(!open)}>{profile.avatar_url?<img src={profile.avatar_url} alt="Foto do perfil"/>:<span>{profile.name?.slice(0,2).toUpperCase()||'US'}</span>}<i>⌄</i></button>{open&&<div className="user-popover"><header>{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:<span>{profile.name?.slice(0,2).toUpperCase()}</span>}<div><strong>{profile.name}</strong><small>{profile.email}</small><em>{profile.role}</em></div></header><label>📷 Alterar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label><Link href="/minha-conta">👤 Meu perfil</Link>{profile.role!=='customer'&&<Link href="/admin">⚙️ Área restrita</Link>}<button onClick={()=>{auth.signOut();location.href='/login'}}>↪ Sair da conta</button></div>}</div>;
}
