import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import CommerceHeader from '../components/CommerceHeader';
import CommerceFooter from '../components/CommerceFooter';
import { configured, db, getSession } from '../lib/supabase';

const money = value => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

export default function ProductDetail() {
  const { id } = useParams();
  const [product,setProduct] = useState(null);
  const [settings,setSettings] = useState({ store_name:'ReVeste', tagline:'Moda circular com propósito.' });
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState('');
  const [favorite,setFavorite] = useState(false);

  useEffect(() => {
    if (!configured) { setMessage('Configure o Supabase para visualizar o catálogo real.');setLoading(false);return; }
    Promise.all([db.product(id),db.settings(),getSession()?db.isFavorite(id):false]).then(([item,store,saved]) => { setProduct(item);if(store)setSettings(store);setFavorite(Boolean(saved)); }).catch(error=>setMessage(error.message)).finally(()=>setLoading(false));
  },[id]);

  const addToBag = goCheckout => {
    const bag = JSON.parse(localStorage.getItem('reveste_cart') || '[]');
    if (!bag.some(item=>item.id===product.id)) {
      localStorage.setItem('reveste_cart',JSON.stringify([...bag,product]));
      window.dispatchEvent(new CustomEvent('cart:updated'));
    }
    if(goCheckout){const checkoutBag=bag.some(item=>item.id===product.id)?bag:[...bag,product];localStorage.setItem('reveste_checkout',JSON.stringify(checkoutBag));sessionStorage.setItem('reveste_checkout_key',crypto.randomUUID());location.href='/checkout';return}
    setMessage(bag.some(item=>item.id===product.id)?'Esta peça já está na sua sacola.':'Peça adicionada à sacola.');
  };
  const toggleFavorite = async () => {
    if (!getSession()) { location.href=`/login?next=/produto/${id}`;return; }
    try { favorite?await db.removeFavorite(id):await db.addFavorite(id);setFavorite(!favorite);setMessage(favorite?'Peça removida dos favoritos.':'Peça salva nos seus favoritos.'); } catch(error){setMessage(error.message);}
  };

  if (loading) return <main className="product-loading"><i/><p>Preparando os detalhes da peça...</p></main>;
  if (!product) return <main className="product-not-found"><span>◇</span><h1>Peça indisponível</h1><p>{message||'Esta peça já encontrou uma nova história ou não está mais publicada.'}</p><Link href="/loja">Voltar ao catálogo</Link></main>;

  return <><Head><title>{product.name} | {settings.store_name}</title><meta name="description" content={product.description||`${product.name}, tamanho ${product.size}, disponível em nosso brechó online.`}/></Head><main className="product-page" style={{'--green':settings.primary_color||'#315d4a'}}>
    <CommerceHeader/>
    <nav className="commerce-breadcrumb" aria-label="Caminho"><Link href="/loja">Loja</Link><span>›</span><Link href="/loja#catalogo">{product.category}</Link><span>›</span><b>{product.name}</b></nav>
    <section className="product-detail">
      <div className="product-detail-image"><img src={product.image_url||'/placeholder.svg'} alt={product.name}/><span>PEÇA ÚNICA</span></div>
      <article><p className="section-kicker">{product.category}</p><h1>{product.name}</h1>{product.brand&&<p className="product-brand">{product.brand}</p>}<div className="product-price">{money(product.price)}</div><div className="product-specs"><span><small>TAMANHO</small><b>{product.size}</b></span><span><small>ESTADO</small><b>{product.condition_grade||'Revisada'}</b></span>{product.color&&<span><small>COR</small><b>{product.color}</b></span>}<span><small>DISPONIBILIDADE</small><b>{product.stock>1?`${product.stock} unidades`:'Última unidade'}</b></span></div><p className="product-description">{product.description||'Peça selecionada pela nossa curadoria, revisada e pronta para viver uma nova história.'}</p>{message&&<div className="store-message">{message}</div>}<div className="product-actions product-actions-commerce"><button className="shop-primary" onClick={()=>addToBag(false)}>Adicionar à sacola</button><button className="buy-now-button" onClick={()=>addToBag(true)}>Comprar agora</button><button className={favorite?'favorite-button saved':'favorite-button'} aria-label={favorite?'Remover dos favoritos':'Salvar nos favoritos'} onClick={toggleFavorite}>{favorite?'♥':'♡'}</button></div><div className="product-service-grid"><span><b>Compra protegida</b><small>Pagamento processado com segurança</small></span><span><b>Envio rastreável</b><small>Acompanhe pela sua conta</small></span><span><b>Peça revisada</b><small>Curadoria antes da publicação</small></span></div><Link className="product-checkout-link" href="/favoritos">Ver meus favoritos →</Link></article>
    </section><CommerceFooter/>
  </main></>;
}
