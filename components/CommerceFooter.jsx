import { useEffect, useState } from 'react';
import Link from '../src/shims/Link';
import StoreBrand from './StoreBrand';
import { configured, db } from '../lib/supabase';

export default function CommerceFooter(){
  const [settings,setSettings]=useState({});
  useEffect(()=>{if(configured)db.settings().then(value=>value&&setSettings(value)).catch(()=>{})},[]);
  const socials=[[settings.instagram,'Instagram'],[settings.facebook,'Facebook'],[settings.tiktok,'TikTok'],[settings.whatsapp,'WhatsApp']].filter(([url])=>url);
  return <footer className="commerce-footer"><div className="commerce-footer-main"><div><StoreBrand/><p>{settings.tagline||'Moda circular para histórias que continuam.'}</p><small>Peças selecionadas, revisadas e prontas para uma nova história.</small></div><div><b>Comprar</b><Link href="/loja#catalogo">Novidades</Link><Link href="/favoritos">Favoritos</Link><Link href="/minha-conta">Meus pedidos</Link></div><div><b>Atendimento</b><Link href="/trocas-e-devolucoes">Trocas e devoluções</Link><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de uso</Link></div><div><b>Circularidade</b><Link href="/doar">Vender ou doar peças</Link><span>Curadoria de segunda mão</span><span>Consumo consciente</span></div></div>{socials.length>0&&<div className="commerce-footer-social">{socials.map(([url,label])=><a key={label} href={label==='WhatsApp'&&!String(url).startsWith('http')?'https://wa.me/'+String(url).replace(/\D/g,''):url} target="_blank" rel="noreferrer">{label}</a>)}</div>}<div className="commerce-footer-bottom"><span>© 2026 {settings.store_name||'ReVeste'}</span><span>Compra protegida · Dados seguros · Moda circular</span></div></footer>;
}
