import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '../components/AuthGuard';
import { db } from '../lib/supabase';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const iso=date=>date.toISOString().slice(0,10);
const paidStatuses=new Set(['pago','separando','enviado','concluido']);
const sourceLabel={purchase:'Compra própria',consignment:'Consignação',donation:'Doação',manual:'Cadastro manual'};

export default function Rentabilidade(){
  const now=new Date(),monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const [from,setFrom]=useState(iso(monthStart)),[to,setTo]=useState(iso(now));
  const [orders,setOrders]=useState([]),[intakes,setIntakes]=useState([]),[settlements,setSettlements]=useState([]),[returns,setReturns]=useState([]);
  const [source,setSource]=useState('todos'),[query,setQuery]=useState(''),[loading,setLoading]=useState(false),[notice,setNotice]=useState('');

  const load=async()=>{
    if(from>to)return setNotice('A data inicial não pode ser posterior à data final.');
    setLoading(true);setNotice('');
    try{
      const [sales,entries,payouts,postSales]=await Promise.all([
        db.report(from+'T00:00:00',to+'T23:59:59'),
        db.inventoryIntakes(),
        db.consignmentSettlements(),
        db.orderReturns(),
      ]);
      setOrders(sales);setIntakes(entries);setSettlements(payouts);setReturns(postSales);
    }catch(error){setNotice(error.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const data=useMemo(()=>{
    const sourceByProduct=new Map();
    intakes.forEach(entry=>(entry.inventory_intake_items||[]).forEach(item=>{
      if(item.product_id)sourceByProduct.set(item.product_id,{source_type:entry.source_type,acquisition_cost:Number(item.acquisition_cost||0),commission_percent:Number(item.store_commission_percent||0)});
    }));
    const settlementByOrderItem=new Map(settlements.map(item=>[item.order_item_id,item]));
    const returnedQty=new Map();
    returns.filter(item=>['received','completed'].includes(item.status)).forEach(ret=>(ret.order_return_items||[]).forEach(item=>{
      returnedQty.set(item.order_item_id,(returnedQty.get(item.order_item_id)||0)+Number(item.quantity||0));
    }));

    const rows=[];
    orders.filter(order=>paidStatuses.has(order.status)).forEach(order=>{
      const subtotal=Number(order.subtotal||0),discount=Number(order.discount||0);
      const merchandiseNet=Math.max(0,subtotal-discount);
      const factor=subtotal>0?merchandiseNet/subtotal:1;
      (order.order_items||[]).forEach(item=>{
        const soldQty=Number(item.quantity||0),returned=Math.min(soldQty,returnedQty.get(item.id)||0),qty=Math.max(0,soldQty-returned);
        if(qty<=0)return;
        const unit=Number(item.unit_price||0),gross=unit*qty,net=gross*factor;
        const origin=sourceByProduct.get(item.product_id)||{source_type:'manual',acquisition_cost:0,commission_percent:0};
        const settlement=settlementByOrderItem.get(item.id);
        let cost=0;
        if(origin.source_type==='purchase')cost=origin.acquisition_cost*qty;
        else if(origin.source_type==='consignment'){
          const originalQty=Math.max(1,soldQty);
          const payout=Number(settlement?.payout_amount||gross*(1-origin.commission_percent/100));
          cost=payout*(qty/originalQty);
        }
        rows.push({
          id:item.id,order_id:order.id,date:order.created_at,name:item.products?.name||'Peça',
          category:item.products?.category||'Sem categoria',source:origin.source_type,
          quantity:qty,gross,net,cost,margin:net-cost,discount_share:gross-net
        });
      });
    });
    return rows;
  },[orders,intakes,settlements,returns]);

  const filtered=useMemo(()=>data.filter(row=>(source==='todos'||row.source===source)&&((row.name+' '+row.category+' '+row.order_id).toLowerCase().includes(query.toLowerCase()))),[data,source,query]);

  const metrics=useMemo(()=>{
    const net=filtered.reduce((sum,row)=>sum+row.net,0),cost=filtered.reduce((sum,row)=>sum+row.cost,0),margin=net-cost;
    return{
      net,cost,margin,items:filtered.reduce((sum,row)=>sum+row.quantity,0),
      rate:net>0?margin/net*100:0,
      discount:filtered.reduce((sum,row)=>sum+row.discount_share,0)
    };
  },[filtered]);

  const bySource=useMemo(()=>Object.entries(filtered.reduce((acc,row)=>{
    const key=row.source;acc[key]||={net:0,cost:0,margin:0,items:0};
    acc[key].net+=row.net;acc[key].cost+=row.cost;acc[key].margin+=row.margin;acc[key].items+=row.quantity;return acc;
  },{})).sort((a,b)=>b[1].margin-a[1].margin),[filtered]);

  const exportCsv=()=>{
    const header=['Data','Pedido','Peça','Categoria','Origem','Qtd','Receita líquida','Custo/repasse','Margem','Desconto rateado'];
    const lines=filtered.map(row=>[
      new Date(row.date).toLocaleDateString('pt-BR'),row.order_id,row.name,row.category,sourceLabel[row.source]||row.source,row.quantity,
      row.net.toFixed(2),row.cost.toFixed(2),row.margin.toFixed(2),row.discount_share.toFixed(2)
    ]);
    const csv=[header,...lines].map(line=>line.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(';')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='rentabilidade-'+from+'-'+to+'.csv';a.click();URL.revokeObjectURL(url);
  };

  return <AuthGuard roles={['admin','manager']}><main className="ops-page profitability-page">
    <header className="ops-head"><div><p className="eyebrow">MARGEM E GIRO</p><h1>Rentabilidade por peça</h1><span>Margem real das vendas após descontos, custo de compra própria e repasses de consignação.</span></div><button className="track-button" disabled={!filtered.length} onClick={exportCsv}>Exportar CSV</button></header>
    {notice&&<div className="admin-notice" role="status">{notice}</div>}
    <section className="ops-card profitability-filters">
      <label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Origem<select value={source} onChange={e=>setSource(e.target.value)}><option value="todos">Todas</option><option value="purchase">Compra própria</option><option value="consignment">Consignação</option><option value="donation">Doação</option><option value="manual">Cadastro manual</option></select></label>
      <label>Pesquisar<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Peça, categoria ou pedido..."/></label>
      <button className="shop-primary" onClick={load} disabled={loading}>{loading?'Atualizando...':'Atualizar período'}</button>
    </section>

    <section className="ops-kpis profitability-kpis">
      <Kpi label="Receita líquida das peças" value={money(metrics.net)}/>
      <Kpi label="Custos + repasses" value={money(metrics.cost)}/>
      <Kpi label="Margem bruta" value={money(metrics.margin)} warning={metrics.margin<0}/>
      <Kpi label="Margem %" value={metrics.rate.toFixed(1)+'%'}/>
      <Kpi label="Descontos rateados" value={money(metrics.discount)}/>
    </section>

    <section className="profitability-grid">
      <article className="ops-card"><h2>Margem por origem</h2>{bySource.length?bySource.map(([key,value])=><div className="profit-source" key={key}><div><b>{sourceLabel[key]||key}</b><small>{value.items} peça(s)</small></div><span>{money(value.net)} receita</span><span>{money(value.cost)} custo</span><strong>{money(value.margin)}</strong></div>):<div className="empty-state">Sem vendas no período.</div>}</article>
      <article className="ops-card"><h2>Leitura do período</h2><div className="profitability-summary"><p><b>{metrics.items}</b> peça(s) consideradas após descontar devoluções recebidas.</p><p>Cupons são rateados proporcionalmente pelos itens do pedido.</p><p>Frete não entra na receita da peça. Em consignação, o custo é o repasse devido ao proprietário.</p></div></article>
    </section>

    <section className="ops-card ops-table"><div><h2>Detalhamento por peça</h2><span>{filtered.length} linha(s)</span></div><div className="table-scroll"><table><thead><tr><th>Data</th><th>Peça</th><th>Origem</th><th>Receita líquida</th><th>Custo/repasse</th><th>Margem</th><th>Margem %</th></tr></thead><tbody>{filtered.length?[...filtered].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(row=><tr key={row.id}><td>{new Date(row.date).toLocaleDateString('pt-BR')}<small>#{row.order_id.slice(0,8)}</small></td><td><b>{row.name}</b><small>{row.category}</small></td><td>{sourceLabel[row.source]||row.source}</td><td>{money(row.net)}<small>{row.discount_share>0?'- '+money(row.discount_share)+' desconto':''}</small></td><td>{money(row.cost)}</td><td><b>{money(row.margin)}</b></td><td>{row.net>0?(row.margin/row.net*100).toFixed(1)+'%':'0%'}</td></tr>):<tr><td colSpan="7">Nenhuma venda confirmada encontrada.</td></tr>}</tbody></table></div></section>
  </main></AuthGuard>;
}

function Kpi({label,value,warning}){return <article className={warning?'warning':''}><small>{label}</small><strong>{value}</strong></article>}
