import { useEffect, useState } from 'react';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import AuthGuard from '../components/AuthGuard';
import StoreBrand from '../components/StoreBrand';
import { db } from '../lib/supabase';

const money = value => Number(value || 0).toLocaleString('pt-BR',{ style:'currency', currency:'BRL' });

export default function Favorites() {
  const [items,setItems] = useState([]);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');
  const load = () => db.favorites().then(setItems).catch(error=>setNotice(error.message)).finally(()=>setLoading(false));
  useEffect(()=>{load()},[]);
  const remove = async product => { await db.removeFavorite(product.id);setNotice(`${product.name} foi removida dos favoritos.`);load(); };

  return <AuthGuard roles={['customer']}><Head><title>Meus favoritos | ReVeste</title></Head><main className="favorites-page">
    <header><Link href="/loja"><StoreBrand/></Link><Link href="/loja">← Continuar comprando</Link></header>
    <section className="favorites-heading"><p>SEU CLOSET DE DESEJOS</p><h1>Peças que você amou.</h1><span>Salve descobertas especiais e volte quando quiser. Como cada peça é única, ela pode ficar indisponível a qualquer momento.</span></section>
    {notice&&<div className="account-notice">{notice}</div>}
    <section className="favorites-content">{loading?<div className="store-skeleton"><i/><i/><i/></div>:items.length?<div className="favorites-grid">{items.map(item=>{const product=item.products;return product&&<article key={item.id}><Link href={`/produto/${product.id}`}><img src={product.image_url||'/placeholder.svg'} alt={product.name}/></Link><div><small>{product.category} · Tam. {product.size}</small><h2><Link href={`/produto/${product.id}`}>{product.name}</Link></h2><strong>{money(product.price)}</strong><span>{product.active&&product.stock>0?'Disponível':'Indisponível'}</span><button onClick={()=>remove(product)}>Remover dos favoritos</button></div></article>})}</div>:<div className="account-empty"><span>♡</span><h3>Sua lista está vazia</h3><p>Use o coração na página de uma peça para guardá-la aqui.</p><Link href="/loja">Descobrir peças →</Link></div>}</section>
  </main></AuthGuard>;
}
