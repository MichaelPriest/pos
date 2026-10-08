import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard';
import CustomerPortalShell from '../components/CustomerPortalShell';
import SystemIcon from '../components/SystemIcon';
import CustomerReturns from '../components/CustomerReturns';
import { auth, db, storage } from '../lib/supabase';
import { findAddress, maskCep, maskDocument, maskPhone } from '../lib/brasil';

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const sectionMap={resumo:'Resumo',pedidos:'Pedidos',enderecos:'Endereços',trocas:'Trocas e devoluções',circularidade:'Circularidade',dados:'Meus dados'};
const statusMeta={
  pendente:['Aguardando pagamento','pending'],
  pago:['Pagamento aprovado','paid'],
  separando:['Preparando pedido','processing'],
  enviado:['Enviado','shipped'],
  concluido:['Entregue','done'],
  cancelado:['Cancelado','cancelled'],
};
const emptyAddress={label:'Casa',zip_code:'',street:'',number:'',complement:'',neighborhood:'',city:'',state:'',is_default:false};

export default function Account(){
  const route=useLocation(),navigate=useNavigate();
  const initialSection=new URLSearchParams(route.search).get('secao')||'resumo';
  const [profile,setProfile]=useState(null),[orders,setOrders]=useState([]),[donations,setDonations]=useState([]),[addresses,setAddresses]=useState([]);
  const [section,setSection]=useState(sectionMap[initialSection]?initialSection:'resumo'),[form,setForm]=useState({name:'',phone:'',document:''}),[addressForm,setAddressForm]=useState(emptyAddress);
  const [notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[addressOpen,setAddressOpen]=useState(false),[avatarLoading,setAvatarLoading]=useState(false);

  const load=async()=>{
    const[p,o,d,a]=await Promise.all([auth.profile(),db.orders(),db.donations(),db.addresses()]);
    setProfile(p);setForm({name:p?.name||'',phone:p?.phone||'',document:p?.document||''});
    setOrders(await Promise.all(o.map(async order=>({...order,tracking_events:await db.trackingEvents(order.id)}))));
    setDonations(d);setAddresses(a);
  };

  useEffect(()=>{
    const params=new URLSearchParams(route.search),orderId=params.get('pedido'),sessionId=params.get('session_id');
    const initialize=async()=>{
      if(params.get('pagamento')==='verificar'&&orderId){
        setNotice('Verificando o pagamento diretamente com a operadora...');
        try{
          const result=await db.verifyPayment(orderId,sessionId);
          if(result.paid){localStorage.removeItem('reveste_checkout');localStorage.removeItem('reveste_cart');window.dispatchEvent(new CustomEvent('cart:updated'));sessionStorage.removeItem('reveste_checkout_key');setNotice('Pagamento confirmado. Seu pedido já está em processamento.')}
          else setNotice('Pagamento ainda não confirmado. O pedido continua aguardando aprovação.');
        }catch(error){setNotice(error.message)}
      }
      try{await load()}catch(error){setNotice(error.message)}finally{setLoading(false)}
    };
    initialize();
  },[]);

  useEffect(()=>{
    const requested=new URLSearchParams(route.search).get('secao')||'resumo';
    const next=sectionMap[requested]?requested:'resumo';
    setSection(current=>current===next?current:next);
  },[route.search]);

  const changeSection=next=>{
    const url=next==='resumo'?'/minha-conta':`/minha-conta?secao=${next}`;
    navigate(url);
    window.scrollTo({top:0,behavior:'smooth'});
  };

  const activeOrders=useMemo(()=>orders.filter(order=>['pendente','pago','separando','enviado'].includes(order.status)),[orders]);
  const spent=useMemo(()=>orders.filter(order=>['pago','separando','enviado','concluido'].includes(order.status)).reduce((sum,order)=>sum+Number(order.total||0),0),[orders]);
  const latestOrder=orders[0]||null;

  const save=async event=>{event.preventDefault();setSaving(true);setNotice('');try{await db.updateMyDetails(form);setNotice('Seus dados foram atualizados.');await load()}catch(error){setNotice(error.message)}finally{setSaving(false)}};
  const uploadAvatar=async event=>{const file=event.target.files?.[0];if(!file)return;setAvatarLoading(true);setNotice('');try{const avatar_url=await storage.uploadImage('avatars',file,'profile',1024*1024);await db.updateProfile(profile.id,{avatar_url});setProfile(current=>({...current,avatar_url}));setNotice('Foto do perfil atualizada.')}catch(error){setNotice(error.message)}finally{setAvatarLoading(false);event.target.value=''}};
  const resumeOrder=async order=>{setNotice('Preparando seu pagamento...');try{const payment=await db.resumePayment(order);if(payment.url)location.href=payment.url;else if(payment.qr_code)setNotice(`Pix disponível para pagamento: ${payment.qr_code}`);else setNotice('Cobrança recuperada.')}catch(error){setNotice(error.message)}};
  const lookupAddress=async()=>{if(String(addressForm.zip_code).replace(/\D/g,'').length!==8)return;try{const result=await findAddress(addressForm.zip_code);setAddressForm(current=>({...current,...result}))}catch(error){setNotice(error.message)}};
  const saveAddress=async event=>{event.preventDefault();setSaving(true);setNotice('');try{await db.saveAddress(addressForm);setAddressForm(emptyAddress);setAddressOpen(false);setNotice('Endereço salvo com sucesso.');await load()}catch(error){setNotice(error.message)}finally{setSaving(false)}};
  const setDefault=async address=>{try{await db.saveAddress({...address,is_default:true});setNotice('Endereço principal atualizado.');await load()}catch(error){setNotice(error.message)}};
  const removeAddress=async id=>{if(!confirm('Excluir este endereço salvo?'))return;try{await db.deleteAddress(id);setNotice('Endereço excluído.');await load()}catch(error){setNotice(error.message)}};

  const avatar=profile?.avatar_url?<img src={profile.avatar_url} alt="Foto do perfil"/>:<span>{profile?.name?.split(' ').filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'CL'}</span>;

  return <AuthGuard roles={['customer']}><Head><title>Minha conta | ReVeste</title></Head>
    <CustomerPortalShell title={sectionMap[section]} subtitle={section==='resumo'?'Tudo sobre suas compras e sua relação com a ReVeste em um só lugar.':undefined}>
      {notice&&<div className="customer-portal-notice" role="status"><SystemIcon name="shield"/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Fechar aviso">×</button></div>}
      {loading?<div className="customer-dashboard-loading"><i/><p>Organizando sua conta...</p></div>:<>
        <nav className="customer-section-tabs" aria-label="Seções da conta">
          {Object.entries(sectionMap).map(([key,label])=><button key={key} className={section===key?'active':''} onClick={()=>changeSection(key)}>{label}</button>)}
        </nav>

        {section==='resumo'&&<section className="customer-dashboard">
          <article className="customer-welcome-card">
            <div className="customer-welcome-profile"><div className="customer-welcome-avatar">{avatar}</div><div><small>OLÁ, {profile?.name?.split(' ')[0]?.toUpperCase()||'CLIENTE'}</small><h2>Que bom ter você por aqui.</h2><p>Acompanhe pedidos, salve seus endereços e continue fazendo a moda circular.</p></div></div>
            <div className="customer-welcome-actions"><button onClick={()=>changeSection('pedidos')}><SystemIcon name="box"/> Ver pedidos</button><Link href="/loja"><SystemIcon name="bag"/> Continuar comprando</Link></div>
          </article>

          <div className="customer-dashboard-kpis">
            <article><SystemIcon name="box"/><div><small>PEDIDOS</small><strong>{orders.length}</strong><span>{activeOrders.length} em andamento</span></div></article>
            <article><SystemIcon name="card"/><div><small>COMPRAS CONFIRMADAS</small><strong>{money(spent)}</strong><span>valor acumulado</span></div></article>
            <article><SystemIcon name="pin"/><div><small>ENDEREÇOS</small><strong>{addresses.length}</strong><span>{addresses.some(item=>item.is_default)?'principal configurado':'configure seu principal'}</span></div></article>
            <article><SystemIcon name="cycle"/><div><small>CIRCULARIDADE</small><strong>{donations.length}</strong><span>solicitações enviadas</span></div></article>
          </div>

          <div className="customer-dashboard-grid">
            <section className="customer-dashboard-panel">
              <header><div><small>ÚLTIMA COMPRA</small><h2>{latestOrder?'Acompanhe seu pedido':'Seu próximo achado começa aqui'}</h2></div>{latestOrder&&<button onClick={()=>changeSection('pedidos')}>Ver todos →</button>}</header>
              {latestOrder?<OrderCard order={latestOrder} compact onResume={resumeOrder}/>:<Empty icon="bag" title="Você ainda não fez uma compra" text="Explore peças únicas e dê uma nova história ao que já existe." action="Explorar a loja" href="/loja"/>}
            </section>
            <aside className="customer-quick-panel"><small>ATALHOS</small><h2>O que você quer fazer?</h2>
              <button onClick={()=>changeSection('enderecos')}><SystemIcon name="pin"/><span><b>Gerenciar endereços</b><small>Deixe o próximo checkout mais rápido</small></span><i>›</i></button>
              <Link href="/favoritos"><SystemIcon name="heart"/><span><b>Ver favoritos</b><small>Volte às peças que você salvou</small></span><i>›</i></Link>
              <button onClick={()=>changeSection('trocas')}><SystemIcon name="cycle"/><span><b>Trocas e devoluções</b><small>Solicite e acompanhe seu pós-venda</small></span><i>›</i></button>
              <Link href="/notificacoes"><SystemIcon name="bell"/><span><b>Ver notificações</b><small>Pagamentos, envio e entrega</small></span><i>›</i></Link>
              <button onClick={()=>changeSection('circularidade')}><SystemIcon name="cycle"/><span><b>Fazer circular</b><small>Doe peças e acompanhe avaliações</small></span><i>›</i></button>
            </aside>
          </div>
        </section>}

        {section==='pedidos'&&<section className="customer-section">
          <div className="customer-section-head"><div><small>HISTÓRICO DE COMPRAS</small><h2>Meus pedidos</h2><p>Acompanhe pagamento, preparação, envio e entrega.</p></div><Link href="/loja">Continuar comprando</Link></div>
          {orders.length?<div className="customer-orders-list">{orders.map(order=><OrderCard order={order} key={order.id} onResume={resumeOrder}/>)}</div>:<Empty icon="bag" title="Nenhum pedido ainda" text="Quando você comprar sua primeira peça, o acompanhamento aparecerá aqui." action="Explorar a loja" href="/loja"/>}
        </section>}

        {section==='trocas'&&<CustomerReturns orders={orders}/>}

        {section==='enderecos'&&<section className="customer-section">
          <div className="customer-section-head"><div><small>ENTREGA</small><h2>Endereços salvos</h2><p>Gerencie os locais usados nas suas compras.</p></div><button className="customer-primary-action" onClick={()=>setAddressOpen(open=>!open)}>{addressOpen?'Cancelar':'+ Novo endereço'}</button></div>
          {addressOpen&&<form className="customer-address-form" onSubmit={saveAddress}>
            <div className="form-row"><label>Identificação<input required value={addressForm.label} onChange={event=>setAddressForm({...addressForm,label:event.target.value})} placeholder="Casa, trabalho..."/></label><label>CEP<input required inputMode="numeric" value={addressForm.zip_code} onChange={event=>setAddressForm({...addressForm,zip_code:maskCep(event.target.value)})} onBlur={lookupAddress}/></label></div>
            <label>Rua / Avenida<input required value={addressForm.street} onChange={event=>setAddressForm({...addressForm,street:event.target.value})}/></label>
            <div className="form-row"><label>Número<input required value={addressForm.number} onChange={event=>setAddressForm({...addressForm,number:event.target.value})}/></label><label>Complemento<input value={addressForm.complement} onChange={event=>setAddressForm({...addressForm,complement:event.target.value})}/></label></div>
            <div className="form-row"><label>Bairro<input required value={addressForm.neighborhood} onChange={event=>setAddressForm({...addressForm,neighborhood:event.target.value})}/></label><label>Cidade<input required value={addressForm.city} onChange={event=>setAddressForm({...addressForm,city:event.target.value})}/></label></div>
            <div className="form-row"><label>Estado<input required maxLength="2" value={addressForm.state} onChange={event=>setAddressForm({...addressForm,state:event.target.value.toUpperCase()})}/></label><label className="customer-checkbox"><input type="checkbox" checked={addressForm.is_default} onChange={event=>setAddressForm({...addressForm,is_default:event.target.checked})}/> Tornar endereço principal</label></div>
            <button className="shop-primary" disabled={saving}>{saving?'Salvando...':'Salvar endereço'}</button>
          </form>}
          {addresses.length?<div className="customer-address-grid">{addresses.map(address=><article key={address.id} className={address.is_default?'default':''}><div className="customer-address-icon"><SystemIcon name="pin"/></div><div><header><b>{address.label||'Endereço'}</b>{address.is_default&&<em>Principal</em>}</header><p>{address.street}, {address.number}{address.complement&&` · ${address.complement}`}<br/>{address.neighborhood}<br/>{address.city}/{address.state} · CEP {address.zip_code}</p><footer>{!address.is_default&&<button onClick={()=>setDefault(address)}>Tornar principal</button>}<button className="danger" onClick={()=>removeAddress(address.id)}>Excluir</button></footer></div></article>)}</div>:<Empty icon="pin" title="Nenhum endereço salvo" text="Cadastre um endereço para agilizar suas próximas compras." action="Comprar agora" href="/loja"/>}
        </section>}

        {section==='circularidade'&&<section className="customer-section">
          <div className="customer-section-head"><div><small>MODA QUE CIRCULA</small><h2>Suas peças também podem recomeçar</h2><p>Acompanhe suas solicitações e envie novas peças para avaliação.</p></div><Link className="customer-primary-action" href="/doar">+ Nova solicitação</Link></div>
          <div className="customer-circular-hero"><SystemIcon name="cycle"/><div><h3>Abra espaço no armário com propósito.</h3><p>Peças em bom estado podem voltar a circular. Envie fotos, conte o estado e nossa equipe acompanha o restante.</p></div><Link href="/doar">Quero fazer circular →</Link></div>
          {donations.length?<div className="customer-donation-list">{donations.map(donation=><article key={donation.id}><div className="customer-donation-images">{donation.images?.slice(0,3).filter(Boolean).map((image,index)=><img src={image} alt="" key={index}/>)}</div><div><small>{new Date(donation.created_at).toLocaleDateString('pt-BR')}</small><h3>{donation.quantity} peça(s) · {donation.category}</h3><p>{donation.condition} · {donation.pickup_method}</p></div><span className="customer-status-pill">{donation.status}</span></article>)}</div>:<Empty icon="cycle" title="Nenhuma solicitação enviada" text="Quando quiser fazer uma peça circular, comece uma avaliação por aqui." action="Enviar peças" href="/doar"/>}
        </section>}

        {section==='dados'&&<section className="customer-section">
          <div className="customer-section-head"><div><small>PERFIL</small><h2>Meus dados</h2><p>Mantenha seus dados atualizados para pedidos, suporte e entrega.</p></div></div>
          <div className="customer-profile-grid">
            <aside className="customer-profile-card"><div className="customer-profile-avatar">{avatar}</div><h3>{profile?.name}</h3><p>{profile?.email}</p><label>{avatarLoading?'Enviando foto...':'Alterar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarLoading} onChange={uploadAvatar}/></label><small>JPG, PNG ou WebP · até 1 MB</small></aside>
            <form className="customer-details customer-details-redesign" onSubmit={save}><label>Nome completo<input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label><div className="form-row"><label>WhatsApp<input value={form.phone} onChange={event=>setForm({...form,phone:maskPhone(event.target.value)})}/></label><label>CPF / CNPJ<input value={form.document} onChange={event=>setForm({...form,document:maskDocument(event.target.value)})}/></label></div><label>E-mail<input disabled value={profile?.email||''}/><small>O e-mail usado para acessar sua conta não é alterado por aqui.</small></label><div className="customer-data-security"><SystemIcon name="shield"/><span><b>Seus dados ficam protegidos.</b><small>Usamos essas informações somente para sua conta, pedidos, entrega e atendimento.</small></span></div><button className="shop-primary" disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button></form>
          </div>
        </section>}
      </>}
    </CustomerPortalShell>
  </AuthGuard>;
}

function OrderCard({order,compact=false,onResume}){
  const [label,tone]=statusMeta[order.status]||[order.status,'default'];
  const event=order.tracking_events?.at(-1);
  return <article className={`customer-order-redesign ${compact?'compact':''}`}>
    <header><div><small>PEDIDO</small><strong>#{order.id.slice(0,8).toUpperCase()}</strong></div><div><small>DATA</small><strong>{new Date(order.created_at).toLocaleDateString('pt-BR')}</strong></div><div><small>TOTAL</small><strong>{money(order.total)}</strong></div><span className={`customer-order-status ${tone}`}>{label}</span></header>
    <div className="customer-order-redesign-body">
      <div className="customer-order-products">{order.order_items?.slice(0,compact?2:4).map(item=><div key={item.id}><img src={item.products?.image_url||'/placeholder.svg'} alt=""/><span><b>{item.products?.name}</b><small>Tam. {item.products?.size} · {item.quantity} un.</small></span></div>)}{order.order_items?.length>(compact?2:4)&&<small>+ {order.order_items.length-(compact?2:4)} item(ns)</small>}</div>
      <aside><small>ENTREGA</small><b>{order.shipping_method||'Entrega padrão'}</b>{order.tracking_code?<><p>{order.carrier} · {order.tracking_code}</p>{order.tracking_url&&<a href={order.tracking_url} target="_blank" rel="noreferrer">Rastrear entrega →</a>}</>:<p>{event?.description||'O rastreio aparecerá aqui após a postagem.'}</p>}{order.status==='pendente'&&order.payment_provider&&order.payment_reference&&<button onClick={()=>onResume(order)}>Retomar pagamento</button>}{['pago','separando','enviado','concluido'].includes(order.status)&&<Link className="customer-order-return-link" href={`/minha-conta?secao=trocas&pedido=${order.id}`}>Solicitar troca / devolução →</Link>}</aside>
    </div>
    {!compact&&order.tracking_events?.length>0&&<div className="customer-order-progress">{order.tracking_events.slice(-4).map((item,index)=><div className={index===order.tracking_events.slice(-4).length-1?'current':''} key={item.id}><i/><span><b>{item.description}</b><small>{new Date(item.occurred_at).toLocaleString('pt-BR')}</small></span></div>)}</div>}
  </article>;
}

function Empty({icon,title,text,action,href}){return <div className="customer-empty-redesign"><span><SystemIcon name={icon}/></span><h3>{title}</h3><p>{text}</p><Link href={href}>{action} →</Link></div>}
