import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '../components/AuthGuard';
import { db } from '../lib/supabase';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=value=>value?new Date(value).toLocaleDateString('pt-BR'):'—';

export default function Consignantes(){
  const [owners,setOwners]=useState([]),[settlements,setSettlements]=useState([]),[intakes,setIntakes]=useState([]),[ownerId,setOwnerId]=useState(''),[status,setStatus]=useState('todos'),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  const [returning,setReturning]=useState(null),[returnReason,setReturnReason]=useState('');

  const load=()=>Promise.all([db.consignors(),db.consignmentSettlements(),db.inventoryIntakes()])
    .then(([people,payouts,entries])=>{setOwners(people);setSettlements(payouts);setIntakes(entries);if(!ownerId&&people[0]?.id)setOwnerId(people[0].id)})
    .catch(error=>setNotice(error.message));

  useEffect(()=>{load()},[]);

  const now=Date.now();
  const rows=useMemo(()=>settlements.filter(item=>{
    if(ownerId&&item.consignor_id!==ownerId)return false;
    if(status==='todos')return true;
    if(status==='liberado')return item.status==='pending'&&new Date(item.available_at).getTime()<=now;
    if(status==='aguardando')return item.status==='pending'&&new Date(item.available_at).getTime()>now;
    return item.status===status;
  }),[settlements,ownerId,status,now]);

  const owner=owners.find(item=>item.id===ownerId);
  const ownerSettlements=settlements.filter(item=>item.consignor_id===ownerId);
  const ownerPieces=intakes.filter(entry=>entry.source_type==='consignment'&&entry.consignor_id===ownerId)
    .flatMap(entry=>(entry.inventory_intake_items||[]).map(item=>({...item,received_at:entry.received_at})));
  const pending=ownerSettlements.filter(item=>item.status==='pending');
  const released=pending.filter(item=>new Date(item.available_at).getTime()<=now);
  const waiting=pending.filter(item=>new Date(item.available_at).getTime()>now);
  const paid=ownerSettlements.filter(item=>item.status==='paid');

  const metrics={
    gross:ownerSettlements.filter(item=>item.status!=='cancelled').reduce((sum,item)=>sum+Number(item.gross_amount||0),0),
    store:ownerSettlements.filter(item=>item.status!=='cancelled').reduce((sum,item)=>sum+Number(item.store_commission_amount||0),0),
    released:released.reduce((sum,item)=>sum+Number(item.payout_amount||0),0),
    waiting:waiting.reduce((sum,item)=>sum+Number(item.payout_amount||0),0),
    paid:paid.reduce((sum,item)=>sum+Number(item.payout_amount||0),0),
  };

  const payAll=async()=>{
    if(!owner||!released.length)return;
    if(!confirm('Confirmar repasse consolidado de '+money(metrics.released)+' para '+owner.name+'?'))return;
    setSaving(true);setNotice('');
    try{
      const result=await db.payConsignorSettlements(owner.id,'Repasse consolidado '+new Date().toLocaleDateString('pt-BR'));
      const item=Array.isArray(result)?result[0]:result;
      setNotice('Repasse concluído: '+(item?.settlements_count||released.length)+' item(ns), '+money(item?.total_amount||metrics.released)+'.');
      await load();
    }catch(error){setNotice(error.message)}finally{setSaving(false)}
  };

  const returnPiece=async()=>{
    if(!returning)return;
    setSaving(true);setNotice('');
    try{
      await db.returnConsignedItem(returning.id,returnReason);
      setNotice('Peça devolvida ao proprietário e removida da loja/PDV.');
      setReturning(null);setReturnReason('');
      await load();
    }catch(error){setNotice(error.message)}finally{setSaving(false)}
  };

  const exportCsv=()=>{
    const header=['Data venda','Peça','SKU','Venda','Comissão loja','Repasse','Liberação','Status'];
    const lines=rows.map(item=>[
      date(item.orders?.created_at),
      item.products?.name||'',
      item.products?.sku||'',
      Number(item.gross_amount||0).toFixed(2),
      Number(item.store_commission_amount||0).toFixed(2),
      Number(item.payout_amount||0).toFixed(2),
      date(item.available_at),
      item.status
    ]);
    const csv=[header,...lines].map(line=>line.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(';')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='extrato-consignacao-'+(owner?.name?.replace(/[^a-z0-9]+/gi,'-').toLowerCase()||'reveste')+'.csv';a.click();URL.revokeObjectURL(url);
  };

  return <AuthGuard roles={['admin','manager']}><main className="ops-page consignor-page">
    <header className="ops-head no-print"><div><p className="eyebrow">CONSIGNAÇÃO</p><h1>Consignantes e repasses</h1><span>Concilie vendas, comissão da loja, valores liberados e pagamentos por proprietário.</span></div><div className="ops-head-actions"><button onClick={()=>window.print()}>Imprimir extrato</button><button onClick={exportCsv}>Exportar CSV</button></div></header>

    {notice&&<div className="admin-notice no-print" role="status" aria-live="polite">{notice}<button onClick={()=>setNotice('')}>×</button></div>}

    <section className="ops-card consignor-selector no-print">
      <label>Proprietário<select value={ownerId} onChange={e=>setOwnerId(e.target.value)}>{owners.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="todos">Todos</option><option value="liberado">Liberados</option><option value="aguardando">Aguardando prazo</option><option value="paid">Pagos</option><option value="cancelled">Cancelados</option></select></label>
      <button className="shop-primary" disabled={!released.length||saving} onClick={payAll}>{saving?'Registrando...':released.length?'Pagar '+money(metrics.released):'Nenhum repasse liberado'}</button>
    </section>

    {owner&&<section className="consignor-print-head"><div><p className="eyebrow">EXTRATO DE CONSIGNAÇÃO</p><h2>{owner.name}</h2><span>{owner.document||'Documento não informado'} · {owner.phone||'Sem telefone'}</span></div><div><small>Chave Pix</small><b>{owner.pix_key||'Não cadastrada'}</b><small>Prazo padrão</small><b>{owner.payout_days} dia(s)</b></div></section>}

    <section className="ops-kpis consignor-kpis">
      <Kpi label="Vendas brutas" value={money(metrics.gross)}/>
      <Kpi label="Comissão da loja" value={money(metrics.store)}/>
      <Kpi label="Liberado para pagamento" value={money(metrics.released)} warning/>
      <Kpi label="Aguardando prazo" value={money(metrics.waiting)}/>
      <Kpi label="Já pago" value={money(metrics.paid)}/>
    </section>

    {returning&&<section className="ops-card consignment-return-panel no-print">
      <div><h2>Devolver peça ao proprietário</h2><span>{returning.name} · {money(returning.sale_price)}</span></div>
      <label>Motivo<textarea rows="3" value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="Ex.: prazo encerrado, solicitação do proprietário, peça sem giro..."/></label>
      <div className="return-actions"><button className="shop-primary" disabled={saving} onClick={returnPiece}>{saving?'Registrando...':'Confirmar devolução'}</button><button disabled={saving} onClick={()=>{setReturning(null);setReturnReason('')}}>Cancelar</button></div>
    </section>}

    <section className="ops-card ops-table"><div><h2>Peças do proprietário</h2><span>{ownerPieces.length} peça(s) no histórico</span></div><div className="table-scroll"><table><thead><tr><th>Peça</th><th>Entrada</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ação</th></tr></thead><tbody>{ownerPieces.length?ownerPieces.map(item=>{const days=Math.max(0,Math.floor((now-new Date(item.received_at).getTime())/86400000));return <tr key={item.id}><td><b>{item.name}</b><small>{item.brand||''}{item.size?' · '+item.size:''}</small></td><td>{date(item.received_at)}<small>{days} dia(s)</small></td><td>{money(item.sale_price)}</td><td>{item.status==='listed'?'Na loja':item.status==='pending'?'Em avaliação':item.status==='sold'?'Vendida':item.status==='returned'?'Devolvida':'—'}</td><td>{item.status}{item.returned_at&&<small>{date(item.returned_at)}{item.return_reason?' · '+item.return_reason:''}</small>}</td><td>{['pending','listed'].includes(item.status)&&<button className="track-button no-print" onClick={()=>{setReturning(item);setReturnReason('')}}>Devolver ao proprietário</button>}</td></tr>}):<tr><td colSpan="6">Nenhuma peça consignada vinculada a este proprietário.</td></tr>}</tbody></table></div></section>

    <section className="ops-card ops-table"><div><h2>Extrato por peça</h2><span>{rows.length} lançamento(s)</span></div><div className="table-scroll"><table><thead><tr><th>Venda</th><th>Peça</th><th>Valor vendido</th><th>Comissão loja</th><th>Repasse</th><th>Liberação</th><th>Status</th></tr></thead><tbody>{rows.length?rows.map(item=>{const releasedNow=item.status==='pending'&&new Date(item.available_at).getTime()<=now;return <tr key={item.id}><td>{date(item.orders?.created_at)}<small>#{String(item.order_id).slice(0,8)}</small></td><td><b>{item.products?.name||'Peça'}</b><small>{item.products?.sku||''}</small></td><td>{money(item.gross_amount)}</td><td>{money(item.store_commission_amount)}<small>{Number(item.commission_percent)}%</small></td><td><b>{money(item.payout_amount)}</b></td><td>{date(item.available_at)}</td><td>{item.status==='paid'?'Pago':item.status==='cancelled'?'Cancelado':releasedNow?'Liberado':'Aguardando prazo'}</td></tr>}):<tr><td colSpan="7">Nenhum lançamento encontrado para este filtro.</td></tr>}</tbody></table></div></section>

    <footer className="consignor-print-footer"><span>ReVeste · Extrato emitido em {new Date().toLocaleString('pt-BR')}</span><b>Total considerado: {money(rows.filter(item=>item.status!=='cancelled').reduce((sum,item)=>sum+Number(item.payout_amount||0),0))}</b></footer>
  </main></AuthGuard>;
}

function Kpi({label,value,warning}){return <article className={warning?'warning':''}><small>{label}</small><strong>{value}</strong></article>}
