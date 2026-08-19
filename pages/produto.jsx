import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import StoreBrand from '../components/StoreBrand';
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

  const addToBag = () => {
    const bag = JSON.parse(localStorage.getItem('reveste_cart') || '[]');
    if (bag.some(item=>item.id===product.id)) return setMessage('Esta peça já está na sua sacola.');
    localStorage.setItem('reveste_cart',JSON.stringify([...bag,product]));
    setMessage('Peça adicionada à sacola. Continue comprando ou vá para a loja finalizar.');
  };
  const toggleFavorite = async () => {
    if (!getSession()) { location.href=`/login?next=/produto/${id}`;return; }
    try { favorite?await db.removeFavorite(id):await db.addFavorite(id);setFavorite(!favorite);setMessage(favorite?'Peça removida dos favoritos.':'Peça salva nos seus favoritos.'); } catch(error){setMessage(error.message);}
  };

  if (loading) return <main className="product-loading"><i/><p>Preparando os detalhes da peça...</p></main>;
  if (!product) return <main className="product-not-found"><span>◇</span><h1>Peça indisponível</h1><p>{message||'Esta peça já encontrou uma nova história ou não está mais publicada.'}</p><Link href="/loja">Voltar ao catálogo</Link></main>;

  return <><Head><title>{product.name} | {settings.store_name}</title><meta name="description" content={product.description||`${product.name}, tamanho ${product.size}, disponível em nosso brechó online.`}/></Head><main className="product-page" style={{'--green':settings.primary_color||'#315d4a'}}>
    <header><Link href="/loja"><StoreBrand/></Link><Link href="/loja">← Voltar ao catálogo</Link></header>
    <section className="product-detail">
      <div className="product-detail-image"><img src={product.image_url||'/placeholder.svg'} alt={product.name}/><span>PEÇA ÚNICA</span></div>
      <article><p className="section-kicker">{product.category}</p><h1>{product.name}</h1><div className="product-price">{money(product.price)}</div><div className="product-specs"><span><small>TAMANHO</small><b>{product.size}</b></span><span><small>DISPONIBILIDADE</small><b>{product.stock>1?`${product.stock} unidades`:'Última unidade'}</b></span></div><p className="product-description">{product.description||'Peça selecionada pela nossa curadoria, revisada e pronta para viver uma nova história.'}</p>{message&&<div className="store-message">{message}</div>}<div className="product-actions"><button className="shop-primary" onClick={addToBag}>Adicionar à sacola</button><button className={favorite?'favorite-button saved':'favorite-button'} aria-label={favorite?'Remover dos favoritos':'Salvar nos favoritos'} onClick={toggleFavorite}>{favorite?'♥':'♡'}</button></div><Link className="product-checkout-link" href="/favoritos">Ver meus favoritos →</Link><ul><li>✓ Peça higienizada e revisada</li><li>✓ Pagamento processado em ambiente protegido</li><li>♻ Compra que prolonga a vida útil da moda</li></ul></article>
    </section>
  </main></>;
}
