import { useEffect, useState } from 'react';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import AuthGuard from '../components/AuthGuard';
import CustomerPortalShell from '../components/CustomerPortalShell';
import { db } from '../lib/supabase';

const money = value => Number(value || 0).toLocaleString('pt-BR',{ style:'currency', currency:'BRL' });

export default function Favorites() {
  const [items,setItems] = useState([]);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');
  const load = () => db.favorites().then(setItems).catch(error=>setNotice(error.message)).finally(()=>setLoading(false));
  useEffect(()=>{load()},[]);
  const remove = async product => { await db.removeFavorite(product.id);setNotice(`${product.name} foi removida dos favoritos.`);load(); };
  const addToBag = product => {const bag=JSON.parse(localStorage.getItem('reveste_cart')||'[]');if(bag.some(item=>item.id===product.id))return setNotice('Esta peça já está na sua sacola.');localStorage.setItem('reveste_cart',JSON.stringify([...bag,product]));window.dispatchEvent(new CustomEvent('cart:updated'));setNotice(product.name+' foi adicionada à sacola.');};

  return <AuthGuard roles={['customer']}><Head><title>Meus favoritos | ReVeste</title></Head><CustomerPortalShell className="favorites-page" eyebrow="SEU CLOSET" title="Favoritos" subtitle="As peças que chamaram sua atenção ficam guardadas aqui para você voltar quando quiser.">
    {notice&&<div className="customer-portal-notice" role="status"><span>{notice}</span></div>}
    <section className="customer-section favorites-content">{loading?<div className="store-skeleton"><i/><i/><i/></div>:items.length?<div className="favorites-grid">{items.map(item=>{const product=item.products;return product&&<article key={item.id}><Link href={`/produto/${product.id}`}><img src={product.image_url||'/placeholder.svg'} alt={product.name}/></Link><div><small>{product.category} · Tam. {product.size}</small><h2><Link href={`/produto/${product.id}`}>{product.name}</Link></h2><strong>{money(product.price)}</strong><span>{product.active&&product.stock>0?'Disponível':'Indisponível'}</span><div className="favorite-card-actions">{product.active&&product.stock>0&&<button className="shop-primary" onClick={()=>addToBag(product)}>Adicionar à sacola</button>}<button onClick={()=>remove(product)}>Remover</button></div></div></article>})}</div>:<div className="account-empty"><span>♡</span><h3>Sua lista está vazia</h3><p>Use o coração na página de uma peça para guardá-la aqui.</p><Link href="/loja">Descobrir peças →</Link></div>}</section>
  </CustomerPortalShell></AuthGuard>;
}
