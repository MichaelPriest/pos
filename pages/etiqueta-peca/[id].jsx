import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AuthGuard from '../../components/AuthGuard';
import Barcode39 from '../../components/Barcode39';
import { db } from '../../lib/supabase';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function ProductLabel(){
  const {id}=useParams();
  const [product,setProduct]=useState(null),[notice,setNotice]=useState('');
  useEffect(()=>{if(id)db.productLabel(id).then(item=>{setProduct(item||null);if(!item)setNotice('Peça não encontrada.')}).catch(error=>setNotice(error.message))},[id]);
  const code=product?.barcode||product?.sku||'';
  return <AuthGuard roles={['admin','manager','inventory']}>
    <main className="piece-label-page">
      {!product?<div className="page-loader"><span>R</span><p>{notice||'Carregando etiqueta...'}</p></div>:<>
        <section className="piece-label-sheet" aria-label="Etiqueta da peça">
          <header><strong>REVESTE</strong><small>MODA CIRCULAR</small></header>
          <h1>{product.name}</h1>
          <div className="piece-label-meta"><span>{product.brand||product.category}</span><span>Tam. {product.size}</span>{product.condition_grade&&<span>{product.condition_grade}</span>}</div>
          <strong className="piece-label-price">{money(product.price)}</strong>
          <Barcode39 value={code}/>
          <div className="piece-label-code">{code||'SEM SKU'}</div>
          <footer>{product.color&&<span>{product.color}</span>}<span>{product.active?'ATIVA':'INATIVA'}</span></footer>
        </section>
        <div className="piece-label-actions no-print"><button className="shop-primary" onClick={()=>window.print()}>Imprimir etiqueta</button><button onClick={()=>history.back()}>Voltar</button></div>
      </>}
    </main>
  </AuthGuard>;
}
