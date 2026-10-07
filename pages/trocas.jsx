import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '../components/AuthGuard';
import { db } from '../lib/supabase';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const statusLabel={requested:'Solicitada',approved:'Aprovada',received:'Recebida',completed:'Concluída',rejected:'Rejeitada'};

export default function Trocas(){
  const [orders,setOrders]=useState([]),[returns,setReturns]=useState([]),[orderId,setOrderId]=useState(''),[selected,setSelected]=useState({}),[resolution,setResolution]=useState('refund'),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  const load=()=>Promise.all([db.orders(),db.orderReturns()]).then(([sales,postSales])=>{setOrders(sales);setReturns(postSales)}).catch(error=>setNotice(error.message));
  useEffect(()=>{load()},[]);
  const eligible=useMemo(()=>orders.filter(order=>['pago','separando','enviado','concluido'].includes(order.status)),[orders]);
  const order=eligible.find(item=>item.id===orderId);
  const selectedCount=Object.values(selected).filter(value=>Number(value)>0).length;

  const toggle=(item,checked)=>setSelected(current=>{const next={...current};if(checked)next[item.id]=String(item.quantity);else delete next[item.id];return next});
  const setQuantity=(item,value)=>setSelected(current=>({...current,[item.id]:String(Math.max(1,Math.min(Number(value)||1,item.quantity)))}));

  const createReturn=async event=>{event.preventDefault();const items=Object.entries(selected).map(([order_item_id,quantity])=>({order_item_id,quantity:Number(quantity)}));if(!orderId||!items.length){setNotice('Selecione um pedido e ao menos um item.');return}setSaving(true);setNotice('');try{
    await db.createOrderReturn(orderId,items,reason,resolution);setReason('');setSelected({});setOrderId('');setNotice(resolution==='refund'?'Devolução aberta. O reembolso só será confirmado depois do recebimento físico.':'Troca aberta. A nova saída deve ser registrada como uma nova venda no PDV.');await load();
  }catch(error){setNotice(error.message)}finally{setSaving(false)}};

  const receive=async (item,restock)=>{setNotice('');try{await db.receiveOrderReturn(item.id,restock);setNotice(restock?'Devolução recebida e peça devolvida ao estoque.':'Devolução recebida sem retorno ao estoque.');await load()}catch(error){setNotice(error.message)}};
  const refund=async item=>{setNotice('');try{await db.confirmManualOrderRefund(item.id,'Reembolso externo confirmado pela equipe');setNotice('Reembolso externo confirmado e despesa registrada no financeiro.');await load()}catch(error){setNotice(error.message)}};
  const refundGateway=async item=>{setNotice('');setSaving(true);try{
    const result=await db.refundOrderReturn(item.id);
    setNotice(result.completed?'Estorno Stripe concluído e conciliado no financeiro.':'Estorno Stripe iniciado. Status atual: '+(result.status||'processando')+'.');
    await load();
  }catch(error){setNotice(error.message)}finally{setSaving(false)}};

  return <AuthGuard roles={['admin','manager']}><main className="ops-page">
    <header className="ops-head"><div><p className="eyebrow">PÓS-VENDA</p><h1>Trocas e devoluções</h1><span>Controle a entrada física da peça, reposição de estoque e confirmação de reembolso sem confundir isso com o estorno do gateway.</span></div></header>
    {notice&&<div className="admin-notice" role="status" aria-live="polite">{notice}<button onClick={()=>setNotice('')}>×</button></div>}

    <section className="ops-kpis">
      <Kpi label="Em aberto" value={returns.filter(x=>!['completed','rejected'].includes(x.status)).length}/>
      <Kpi label="Aguardando reembolso" value={returns.filter(x=>x.refund_status==='pending').length} warning/>
      <Kpi label="Reembolsos confirmados" value={returns.filter(x=>x.refund_status==='completed').length}/>
      <Kpi label="Valor pendente" value={money(returns.filter(x=>x.refund_status==='pending').reduce((sum,x)=>sum+Number(x.refund_amount||0),0))} warning/>
    </section>

    <form className="ops-card return-form" onSubmit={createReturn}><div><h2>Abrir pós-venda</h2><span>Escolha o pedido e as peças que retornam à loja.</span></div>
      <label>Pedido<select required value={orderId} onChange={e=>{setOrderId(e.target.value);setSelected({})}}><option value="">Selecione...</option>{eligible.map(o=><option key={o.id} value={o.id}>{o.customer_name} · {new Date(o.created_at).toLocaleDateString('pt-BR')} · {money(o.total)}</option>)}</select></label>
      {order&&<div className="return-order-items">{(order.order_items||[]).map(item=><label key={item.id} className="return-item-row"><input type="checkbox" checked={selected[item.id]!=null} onChange={e=>toggle(item,e.target.checked)}/><span><b>{item.products?.name||'Peça'}</b><small>{money(item.unit_price)} · comprado: {item.quantity}</small></span>{selected[item.id]!=null&&<input aria-label="Quantidade devolvida" type="number" min="1" max={item.quantity} value={selected[item.id]} onChange={e=>setQuantity(item,e.target.value)}/>}</label>)}</div>}
      <div className="form-row"><label>Solução<select value={resolution} onChange={e=>setResolution(e.target.value)}><option value="refund">Devolução + reembolso</option><option value="exchange">Troca</option></select></label><label>Itens selecionados<input value={selectedCount} readOnly/></label></div>
      <label>Motivo<textarea required rows="3" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex.: tamanho não serviu, defeito identificado, desistência..."/></label>
      <div className="return-warning"><b>Importante:</b> pedidos pagos pelo Stripe podem ser estornados automaticamente após o recebimento físico. Mercado Pago, PagBank e outros meios continuam exigindo confirmação manual depois que o reembolso externo realmente ocorrer.</div>
      <button className="shop-primary" disabled={saving}>{saving?'Abrindo...':'Abrir pós-venda'}</button>
    </form>

    <section className="ops-card ops-table"><div><h2>Histórico de pós-venda</h2><span>{returns.length} ocorrência(s)</span></div><div className="table-scroll"><table><thead><tr><th>Data</th><th>Cliente / pedido</th><th>Tipo</th><th>Peças</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>{returns.length?returns.map(item=><tr key={item.id}><td>{new Date(item.requested_at).toLocaleString('pt-BR')}</td><td><b>{item.orders?.customer_name||'Cliente'}</b><small>{item.order_id.slice(0,8)} · {item.orders?.payment_provider||item.orders?.payment_method||'pagamento'}</small></td><td>{item.resolution==='refund'?'Devolução':'Troca'}</td><td><div className="return-pieces">{(item.order_return_items||[]).map(ri=><span key={ri.id}>{ri.products?.name||'Peça'} × {ri.quantity}{ri.restocked?' · reposta':''}</span>)}</div></td><td>{money(item.refund_amount)}</td><td><b>{statusLabel[item.status]||item.status}</b><small>{item.refund_status==='pending'?'reembolso pendente':item.refund_status==='completed'?'reembolso confirmado':item.refund_status==='failed'?'falha no reembolso':''}{item.refund_provider?' · '+item.refund_provider:''}{item.refund_gateway_status?' · '+item.refund_gateway_status:''}</small></td><td><div className="return-actions">{['requested','approved'].includes(item.status)&&<><button onClick={()=>receive(item,true)}>Receber + repor</button><button onClick={()=>receive(item,false)}>Receber sem repor</button></>}{item.status==='received'&&item.resolution==='refund'&&['pending','failed'].includes(item.refund_status)&&<>{item.orders?.payment_provider==='stripe'&&<button disabled={saving} onClick={()=>refundGateway(item)}>Estornar no Stripe</button>}<button disabled={saving} onClick={()=>refund(item)}>Confirmar reembolso externo</button></>}</div></td></tr>):<tr><td colSpan="7">Nenhuma troca ou devolução registrada.</td></tr>}</tbody></table></div></section>
  </main></AuthGuard>;
}

function Kpi({label,value,warning}){return <article className={warning?'warning':''}><small>{label}</small><strong>{value}</strong></article>}
