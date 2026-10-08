import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import SystemIcon from './SystemIcon';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const labels={
  requested:'Recebida pela equipe',approved:'Aprovada',
  received:'Peça recebida',completed:'Concluída',rejected:'Não aprovada'
};

export default function CustomerReturns({orders=[]}){
  const [history,setHistory]=useState([]),[orderId,setOrderId]=useState(''),[selected,setSelected]=useState({}),
        [resolution,setResolution]=useState('refund'),[reason,setReason]=useState(''),
        [saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
  const load=async()=>{
    try{setHistory(await db.myOrderReturns())}catch(error){setNotice(error.message)}
    finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);
  const eligible=useMemo(()=>orders.filter(order=>['pago','separando','enviado','concluido'].includes(order.status)),[orders]);
  const order=eligible.find(item=>item.id===orderId);
  const existingItemIds=new Set(history.filter(item=>item.status!=='rejected').flatMap(item=>item.order_return_items?.map(piece=>piece.order_item_id)||[]));
  const pieces=(order?.order_items||[]).filter(item=>!existingItemIds.has(item.id));
  const select=(item,checked)=>setSelected(old=>{const next={...old};if(checked)next[item.id]=1;else delete next[item.id];return next});
  const submit=async event=>{
    event.preventDefault();
    const items=Object.entries(selected).map(([order_item_id,quantity])=>({order_item_id,quantity:Number(quantity)}));
    if(!orderId||!items.length)return setNotice('Escolha um pedido e uma peça.');
    setSaving(true);setNotice('');
    try{
      await db.requestMyOrderReturn(orderId,items,reason.trim(),resolution);
      setSelected({});setOrderId('');setReason('');
      setNotice('Solicitação enviada. A equipe analisará o pedido antes de orientar os próximos passos.');
      await load();
    }catch(error){setNotice(error.message)}
    finally{setSaving(false)}
  };
  return <section className="customer-section customer-return-portal">
    <div className="customer-section-head"><div><small>PÓS-VENDA</small><h2>Solicitar troca ou devolução</h2><p>Selecione as peças do pedido e conte o motivo. A solicitação não gera estorno ou postagem automaticamente.</p></div></div>
    {notice&&<div className="customer-portal-notice" role="status"><SystemIcon name="shield"/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Fechar aviso">×</button></div>}
    <form className="customer-return-form" onSubmit={submit}>
      <label>Pedido
        <select value={orderId} required onChange={event=>{setOrderId(event.target.value);setSelected({})}}>
          <option value="">Selecione um pedido...</option>
          {eligible.map(item=><option key={item.id} value={item.id}>#{item.id.slice(0,8).toUpperCase()} · {new Date(item.created_at).toLocaleDateString('pt-BR')} · {money(item.total)}</option>)}
        </select>
      </label>
      {order&&<fieldset><legend>Peças para solicitar pós-venda</legend>
        {pieces.length===0?<p>As peças deste pedido já possuem solicitações em andamento.</p>:
          pieces.map(item=><label className="customer-return-piece" key={item.id}>
            <input type="checkbox" checked={selected[item.id]!=null} onChange={event=>select(item,event.target.checked)}/>
            <img src={item.products?.image_url||'/placeholder.svg'} alt=""/>
            <span><strong>{item.products?.name||'Peça'}</strong><small>{money(item.unit_price)} · Quantidade comprada: {item.quantity}</small></span>
            {selected[item.id]!=null&&<input aria-label={'Quantidade de '+(item.products?.name||'peça')} type="number" min="1" max={item.quantity} value={selected[item.id]} onChange={event=>setSelected(old=>({...old,[item.id]:Math.max(1,Math.min(Number(event.target.value)||1,item.quantity))}))}/>}
          </label>)}
      </fieldset>}
      <label>O que deseja?
        <select value={resolution} onChange={event=>setResolution(event.target.value)}>
          <option value="refund">Devolução e reembolso</option><option value="exchange">Troca de peça</option>
        </select>
      </label>
      <label>Descreva o motivo
        <textarea required minLength={10} maxLength={1000} rows={4} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Ex.: tamanho não serviu, peça apresentou defeito..."/>
      </label>
      <p className="customer-return-policy">Após o envio, a equipe verifica o pedido e informa as orientações de devolução. A reposição de estoque e o reembolso só são registrados após o procedimento operacional.</p>
      <button className="customer-primary-action" disabled={saving||!orderId||!Object.keys(selected).length}>{saving?'Enviando...':'Enviar solicitação'}</button>
    </form>
    <div className="customer-return-history"><h3>Minhas solicitações</h3>
      {loading?<p>Carregando solicitações...</p>:history.length===0?<p>Nenhuma troca ou devolução solicitada até agora.</p>:
        history.map(item=><article key={item.id}><div><small>#{item.order_id.slice(0,8).toUpperCase()} · {new Date(item.requested_at).toLocaleDateString('pt-BR')}</small><b>{item.resolution==='refund'?'Devolução':'Troca'}</b><span>{item.reason}</span><small>{item.order_return_items?.map(piece=>piece.products?.name||'Peça').join(' · ')}</small></div><div><em>{labels[item.status]||item.status}</em>{item.resolution==='refund'&&<strong>{money(item.refund_amount)}</strong>}{item.refund_status==='completed'&&<small>Reembolso concluído</small>}</div></article>)
      }
    </div>
  </section>;
}
