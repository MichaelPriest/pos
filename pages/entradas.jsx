import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '../components/AuthGuard';
import { db, storage, getSession } from '../lib/supabase';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const intakeInitial=()=>({source_type:'consignment',consignor_id:'',notes:''});
const itemInitial=()=>({name:'',description:'',category:'Feminino',brand:'',size:'M',color:'',condition_grade:'bom',acquisition_cost:'0',sale_price:'',store_commission_percent:'40',images:[]});

export default function Entradas(){
  const [consignors,setConsignors]=useState([]),[intakes,setIntakes]=useState([]),[settlements,setSettlements]=useState([]);
  const [intakeForm,setIntakeForm]=useState(intakeInitial),[itemForm,setItemForm]=useState(itemInitial),[selectedIntake,setSelectedIntake]=useState('');
  const [ownerForm,setOwnerForm]=useState({name:'',phone:'',document:'',pix_key:'',payout_days:'7'}),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[batchItems,setBatchItems]=useState([]);

  const load=()=>Promise.all([db.consignors(),db.inventoryIntakes(),db.consignmentSettlements()])
    .then(([owners,entries,payouts])=>{setConsignors(owners);setIntakes(entries);setSettlements(payouts)})
    .catch(error=>setNotice(error.message));
  useEffect(()=>{load()},[]);

  const selectedEntry=intakes.find(entry=>entry.id===selectedIntake);
  const estimatedMargin=useMemo(()=>{
    const sale=Number(itemForm.sale_price||0),cost=Number(itemForm.acquisition_cost||0),commission=Number(itemForm.store_commission_percent||0);
    if(selectedEntry?.source_type==='consignment')return sale*(commission/100);
    if(selectedEntry?.source_type==='purchase')return sale-cost;
    return sale;
  },[itemForm.sale_price,itemForm.acquisition_cost,itemForm.store_commission_percent,selectedEntry?.source_type]);

  const kpis=useMemo(()=>({
    appraisal:intakes.filter(x=>['draft','appraisal'].includes(x.status)).length,
    pendingItems:intakes.flatMap(x=>x.inventory_intake_items||[]).filter(x=>x.status==='pending').length,
    listed:intakes.flatMap(x=>x.inventory_intake_items||[]).filter(x=>x.status==='listed').length,
    payout:settlements.filter(x=>x.status==='pending').reduce((sum,x)=>sum+Number(x.payout_amount||0),0),
  }),[intakes,settlements]);

  const createOwner=async event=>{event.preventDefault();setSaving(true);setNotice('');try{
    const created=await db.createConsignor({...ownerForm,payout_days:Number(ownerForm.payout_days||7)});
    const owner=Array.isArray(created)?created[0]:created;
    setOwnerForm({name:'',phone:'',document:'',pix_key:'',payout_days:'7'});
    setNotice('Proprietário cadastrado.');
    await load();
    if(owner?.id)setIntakeForm(current=>({...current,consignor_id:owner.id}));
  }catch(error){setNotice(error.message)}finally{setSaving(false)}};

  const createIntake=async event=>{event.preventDefault();setSaving(true);setNotice('');try{
    const payload={...intakeForm,consignor_id:intakeForm.source_type==='consignment'?intakeForm.consignor_id:null};
    const created=await db.createInventoryIntake(payload),entry=Array.isArray(created)?created[0]:created;
    setSelectedIntake(entry?.id||'');setIntakeForm(intakeInitial());setNotice('Entrada aberta para avaliação.');await load();
  }catch(error){setNotice(error.message)}finally{setSaving(false)}};

  const uploadImages=async event=>{const files=[...(event.target.files||[])].slice(0,Math.max(0,5-itemForm.images.length));if(!files.length)return;setUploading(true);setNotice('');try{
    const urls=[];for(const file of files)urls.push(await storage.uploadImage('products',file,'intakes',2*1024*1024,true));
    setItemForm(current=>({...current,images:[...current.images,...urls].slice(0,5)}));setNotice(urls.length+' foto(s) anexada(s) à avaliação.');
  }catch(error){setNotice(error.message)}finally{setUploading(false);event.target.value=''}};
  const removeImage=index=>setItemForm(current=>({...current,images:current.images.filter((_,i)=>i!==index)}));

  const createItem=event=>{event.preventDefault();if(!selectedIntake){setNotice('Selecione uma entrada antes de adicionar a peça.');return}
    const draft={...itemForm,acquisition_cost:Number(itemForm.acquisition_cost||0),sale_price:Number(itemForm.sale_price),store_commission_percent:Number(itemForm.store_commission_percent)};
    setBatchItems(current=>[...current,draft]);
    setItemForm(current=>({...itemInitial(),category:current.category,brand:current.brand,size:current.size,color:current.color,condition_grade:current.condition_grade,store_commission_percent:current.store_commission_percent}));
    setNotice('Peça adicionada à lista. Revise o lote e salve quando terminar.');
  };
  const removeBatchItem=index=>setBatchItems(current=>current.filter((_,i)=>i!==index));
  const saveBatch=async()=>{if(!selectedIntake||!batchItems.length)return;setSaving(true);setNotice('');try{
    const token=getSession()?.access_token,response=await fetch('/api/admin/intake-items-batch',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token||''}`},body:JSON.stringify({intake_id:selectedIntake,items:batchItems})}),data=await response.json();
    if(!response.ok)throw new Error(data.message||'Não foi possível salvar o lote.');
    setBatchItems([]);setNotice(data.count+' peça(s) salvas para avaliação em uma única operação.');await load();
  }catch(error){setNotice(error.message)}finally{setSaving(false)}};
  const selectIntake=id=>{if(id!==selectedIntake&&batchItems.length&&!confirm('Trocar de entrada descarta a lista ainda não salva. Continuar?'))return;const entry=intakes.find(x=>x.id===id);if(id!==selectedIntake)setBatchItems([]);setSelectedIntake(id);setItemForm(current=>({...current,acquisition_cost:entry?.source_type==='purchase'?current.acquisition_cost:'0'}))};

  const approve=async id=>{setNotice('');try{await db.approveInventoryIntakeItem(id);setNotice('Peça aprovada e publicada no estoque.');await load()}catch(error){setNotice(error.message)}};
  const pay=async settlement=>{setNotice('');try{await db.payConsignmentSettlement(settlement.id,'Baixa manual pelo ReVeste');setNotice('Repasse registrado e lançado no financeiro.');await load()}catch(error){setNotice(error.message)}};

  return <AuthGuard roles={['admin','manager','inventory']}><main className="ops-page">
    <header className="ops-head"><div><p className="eyebrow">CICLO DA PEÇA</p><h1>Entradas e consignação</h1><span>Receba, avalie, publique peças e acompanhe repasses sem misturar estoque próprio e consignado.</span></div></header>
    <section className="ops-kpis"><Kpi label="Entradas em avaliação" value={kpis.appraisal}/><Kpi label="Peças aguardando aprovação" value={kpis.pendingItems}/><Kpi label="Peças publicadas" value={kpis.listed}/><Kpi label="Repasses pendentes" value={money(kpis.payout)} warning/></section>
    {notice&&<div className="admin-notice" role="status" aria-live="polite">{notice}<button onClick={()=>setNotice('')}>×</button></div>}

    <section className="ops-split">
      <form className="ops-card" onSubmit={createOwner}><h2>Novo proprietário</h2><span>Use para peças em consignação.</span>
        <label>Nome<input required maxLength="120" value={ownerForm.name} onChange={e=>setOwnerForm({...ownerForm,name:e.target.value})}/></label>
        <div className="form-row"><label>Telefone<input value={ownerForm.phone} onChange={e=>setOwnerForm({...ownerForm,phone:e.target.value})}/></label><label>Documento<input value={ownerForm.document} onChange={e=>setOwnerForm({...ownerForm,document:e.target.value})}/></label></div>
        <label>Chave Pix<input value={ownerForm.pix_key} onChange={e=>setOwnerForm({...ownerForm,pix_key:e.target.value})}/></label>
        <label>Prazo para liberar repasse (dias)<input type="number" min="0" max="90" value={ownerForm.payout_days} onChange={e=>setOwnerForm({...ownerForm,payout_days:e.target.value})}/></label>
        <button className="shop-primary" disabled={saving}>Cadastrar proprietário</button>
      </form>

      <form className="ops-card" onSubmit={createIntake}><h2>Nova entrada</h2><span>Abra um lote antes de cadastrar as peças.</span>
        <label>Origem<select value={intakeForm.source_type} onChange={e=>setIntakeForm({...intakeForm,source_type:e.target.value,consignor_id:e.target.value==='consignment'?intakeForm.consignor_id:''})}><option value="consignment">Consignação</option><option value="purchase">Compra própria</option><option value="donation">Doação</option></select></label>
        {intakeForm.source_type==='consignment'&&<label>Proprietário<select required value={intakeForm.consignor_id} onChange={e=>setIntakeForm({...intakeForm,consignor_id:e.target.value})}><option value="">Selecione...</option>{consignors.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label>Observações<textarea rows="4" value={intakeForm.notes} onChange={e=>setIntakeForm({...intakeForm,notes:e.target.value})}/></label>
        <button className="shop-primary" disabled={saving}>Abrir entrada</button>
      </form>
    </section>

    <section className="ops-card"><div><h2>Avaliar peça</h2><span>Peças só aparecem na loja depois da aprovação.</span></div>
      <form className="intake-item-form" onSubmit={createItem}>
        <label>Entrada<select required value={selectedIntake} onChange={e=>selectIntake(e.target.value)}><option value="">Selecione...</option>{intakes.filter(x=>['draft','appraisal'].includes(x.status)).map(x=><option key={x.id} value={x.id}>{new Date(x.received_at).toLocaleDateString('pt-BR')} · {x.source_type==='consignment'?(x.consignors?.name||'Consignação'):x.source_type==='purchase'?'Compra própria':'Doação'}</option>)}</select></label>
        <div className="form-row"><label>Nome da peça<input required value={itemForm.name} onChange={e=>setItemForm({...itemForm,name:e.target.value})}/></label><label>Marca<input value={itemForm.brand} onChange={e=>setItemForm({...itemForm,brand:e.target.value})}/></label></div>
        <div className="form-row"><label>Categoria<input required value={itemForm.category} onChange={e=>setItemForm({...itemForm,category:e.target.value})}/></label><label>Tamanho<input required value={itemForm.size} onChange={e=>setItemForm({...itemForm,size:e.target.value})}/></label><label>Cor<input value={itemForm.color} onChange={e=>setItemForm({...itemForm,color:e.target.value})}/></label></div>
        <div className="form-row"><label>Estado<select value={itemForm.condition_grade} onChange={e=>setItemForm({...itemForm,condition_grade:e.target.value})}><option value="novo">Novo</option><option value="excelente">Excelente</option><option value="bom">Bom</option><option value="regular">Regular</option></select></label>{selectedEntry?.source_type==='purchase'&&<label>Custo de aquisição<input type="number" min="0" step="0.01" value={itemForm.acquisition_cost} onChange={e=>setItemForm({...itemForm,acquisition_cost:e.target.value})}/><small>Será lançado como despesa quando a peça for publicada.</small></label>}<label>Preço de venda<input required type="number" min="0.01" step="0.01" value={itemForm.sale_price} onChange={e=>setItemForm({...itemForm,sale_price:e.target.value})}/></label></div>
        {selectedEntry?.source_type==='consignment'&&<label>Comissão do brechó (%)<input type="number" min="0" max="100" step="0.01" value={itemForm.store_commission_percent} onChange={e=>setItemForm({...itemForm,store_commission_percent:e.target.value})}/><small>O restante do valor será calculado como repasse ao proprietário.</small></label>}
        {selectedEntry&&Number(itemForm.sale_price||0)>0&&<div className="intake-margin-preview"><small>Margem estimada do brechó</small><strong>{money(estimatedMargin)}</strong><span>{selectedEntry.source_type==='consignment'?'Comissão estimada':selectedEntry.source_type==='purchase'?'Preço menos custo de aquisição':'Doação sem custo de aquisição'}</span></div>}
        <label>Descrição<textarea rows="3" value={itemForm.description} onChange={e=>setItemForm({...itemForm,description:e.target.value})}/></label>
        <label>Fotos da peça<input type="file" multiple disabled={itemForm.images.length>=5} accept="image/jpeg,image/png,image/webp" onChange={uploadImages}/><small>{uploading?'Enviando...':itemForm.images.length>=5?'Limite de 5 fotos atingido':itemForm.images.length?itemForm.images.length+' de 5 fotos anexadas':'JPG, PNG ou WebP até 2 MB · máximo 5'}</small></label>
        {itemForm.images.length>0&&<div className="intake-photo-grid">{itemForm.images.map((url,index)=><figure key={url}><img src={url} alt={'Foto '+(index+1)+' da peça'}/><button type="button" aria-label={'Remover foto '+(index+1)} onClick={()=>removeImage(index)}>×</button></figure>)}</div>}
        <button className="shop-primary" disabled={saving||uploading}>Adicionar à lista</button>
      </form>
      {batchItems.length>0&&<div className="intake-batch-review"><div className="intake-batch-head"><div><small>LOTE NÃO SALVO</small><h3>{batchItems.length} peça(s) pronta(s) para gravar</h3></div><button type="button" className="shop-primary" disabled={saving} onClick={saveBatch}>{saving?'Salvando lote...':'Salvar lote de '+batchItems.length+' peça(s)'}</button></div><div className="intake-batch-list">{batchItems.map((item,index)=><article key={index}><div>{item.images?.[0]?<img src={item.images[0]} alt=""/>:<span>Sem foto</span>}</div><section><b>{item.name}</b><small>{item.brand||'Sem marca'} · {item.size} · {item.condition_grade}</small><strong>{money(item.sale_price)}</strong></section><button type="button" onClick={()=>removeBatchItem(index)} aria-label={'Remover '+item.name+' da lista'}>×</button></article>)}</div></div>}
    </section>

    <section className="ops-card ops-table"><div><h2>Entradas recentes</h2><span>{intakes.length} lote(s)</span></div><div className="table-scroll"><table><thead><tr><th>Entrada</th><th>Origem</th><th>Proprietário</th><th>Peças</th><th>Status</th></tr></thead><tbody>{intakes.map(entry=><tr key={entry.id}><td>{new Date(entry.received_at).toLocaleString('pt-BR')}</td><td>{entry.source_type==='consignment'?'Consignação':entry.source_type==='purchase'?'Compra própria':'Doação'}</td><td>{entry.consignors?.name||'—'}</td><td><div className="intake-piece-list">{(entry.inventory_intake_items||[]).map(item=><span key={item.id}><b>{item.name}</b> · {money(item.sale_price)}{entry.source_type==='purchase'?' · custo '+money(item.acquisition_cost):''} · {item.status==='listed'?'Publicado':'Em avaliação'} {item.status==='pending'&&<button type="button" onClick={()=>approve(item.id)}>Publicar no estoque</button>}{item.status==='listed'&&item.product_id&&<a className="intake-label-link" href={`/etiqueta-peca/${item.product_id}`}>Imprimir etiqueta</a>}</span>)}{!(entry.inventory_intake_items||[]).length&&<small>Nenhuma peça cadastrada.</small>}</div></td><td>{entry.status}</td></tr>)}</tbody></table></div></section>

    <section className="ops-card ops-table"><div><h2>Repasses de consignação</h2><span>Gerados automaticamente quando a venda é confirmada.</span></div><div className="table-scroll"><table><thead><tr><th>Proprietário</th><th>Peça</th><th>Venda</th><th>Comissão</th><th>Repasse</th><th>Liberação</th><th>Status</th><th/></tr></thead><tbody>{settlements.length?settlements.map(s=>{const available=new Date(s.available_at).getTime()<=Date.now();return <tr key={s.id}><td><b>{s.consignors?.name||'—'}</b><small>{s.consignors?.pix_key||''}</small></td><td>{s.products?.name||'—'}<small>{s.products?.sku||''}</small></td><td>{money(s.gross_amount)}</td><td>{money(s.store_commission_amount)}<small>{Number(s.commission_percent)}%</small></td><td>{money(s.payout_amount)}</td><td>{new Date(s.available_at).toLocaleDateString('pt-BR')}</td><td>{s.status==='paid'?'Pago':available?'Liberado':'Aguardando prazo'}</td><td>{s.status==='pending'&&available&&<button onClick={()=>pay(s)}>Registrar repasse</button>}</td></tr>}):<tr><td colSpan="8">Nenhum repasse de consignação gerado ainda.</td></tr>}</tbody></table></div></section>
  </main></AuthGuard>;
}

function Kpi({label,value,warning}){return <article className={warning?'warning':''}><small>{label}</small><strong>{value}</strong></article>}
