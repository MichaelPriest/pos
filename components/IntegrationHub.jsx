const groups = [
  { title:'Pagamentos', description:'Receba e concilie vendas automaticamente.', items:[
    ['mercadopago','Mercado Pago','MP','Checkout, Pix e notificações de pagamento'],
    ['stripe','Stripe','S','Cartões e checkout hospedado'],
    ['pagbank','PagBank','PB','Pix e pagamentos PagBank'],
  ]},
  { title:'Marketplaces', description:'Prepare a sincronização do catálogo e dos pedidos.', items:[
    ['mercadolivre','Mercado Livre','ML','Anúncios, estoque e pedidos'],
    ['shopee','Shopee','SP','Catálogo, estoque e pedidos'],
  ]},
  { title:'Marketing e atendimento', description:'Conecte campanhas, mensagens e redes sociais.', items:[
    ['meta','Meta','M','Instagram, Facebook e catálogo'],
    ['whatsapp','WhatsApp Business','WA','Mensagens transacionais e atendimento'],
  ]},
  { title:'Frete e logística', description:'Centralize cotações, etiquetas e rastreamento.', items:[
    ['melhorenvio','Melhor Envio','ME','Cotações, etiquetas e rastreio'],
    ['correios','Correios','C','Postagem e acompanhamento de entregas'],
  ]},
];

const links = [
  ['instagram','Instagram','https://instagram.com/sualoja'],['facebook','Facebook','https://facebook.com/sualoja'],
  ['x_url','X / Twitter','https://x.com/sualoja'],['tiktok','TikTok','https://tiktok.com/@sualoja'],
  ['marketplace_mercadolivre','Loja no Mercado Livre','https://lista.mercadolivre.com.br/sualoja'],
  ['marketplace_shopee','Loja na Shopee','https://shopee.com.br/sualoja'],
];

export const integrationProviders = groups.flatMap(group=>group.items.map(item=>item[0]));
export const operationalProviders = ['mercadopago','stripe','pagbank','melhorenvio'];

export default function IntegrationHub({secrets,secretForm,setSecretForm,saveSecret,deleteSecret,settings,setSettings,saveSettings,shippingSettings,setShippingSettings,saveShippingSettings}) {
  const configured=integrationProviders.filter(provider=>secrets[provider]?.configured).length,operational=new Set(operationalProviders);
  return <section className="integration-hub">
    <header className="integration-hero"><div><p className="eyebrow">CENTRAL DE CONEXÕES</p><h2>Integrações</h2><span>Gerencie pagamentos, marketplaces, marketing e logística sem expor suas credenciais.</span></div><div className="integration-score"><b>{configured}/{integrationProviders.length}</b><small>conectadas</small></div></header>
    <div className="integration-security">🔒 As credenciais são criptografadas no servidor e nunca são enviadas de volta ao navegador. O status abaixo diferencia credencial salva de conector realmente implementado.</div>
    {groups.map(group=><section className="integration-group" key={group.title}><div className="integration-group-title"><h3>{group.title}</h3><p>{group.description}</p></div><div className="integration-grid">{group.items.map(([provider,name,initials,description])=>{const state=secrets[provider]||{},isOperational=operational.has(provider);return <article className={`integration-card ${state.configured?'connected':''}`} key={provider}><div className="integration-card-head"><i>{initials}</i><span><b>{name}</b><small>{description}</small></span><em className={isOperational?'available':'planned'}>{isOperational?'Conector disponível':'Conector pendente'}</em></div><p className="integration-capability">{isOperational?(state.configured?'Credencial salva. O backend já possui fluxo para este provedor.':'Fluxo implementado; falta configurar a credencial para uso.'):(state.configured?'Credencial salva para a futura integração. Ainda não há sincronização automática.':'A credencial pode ser preparada, mas a sincronização automática ainda será implementada.')}</p><label>Token ou chave secreta<input type="password" autoComplete="new-password" value={secretForm[provider]||''} onChange={event=>setSecretForm(current=>({...current,[provider]:event.target.value}))} placeholder={state.configured?'Insira uma nova chave para substituir':'Cole a credencial da plataforma'}/></label>{state.updated_at&&<small className="integration-updated">Atualizada em {new Date(state.updated_at).toLocaleString('pt-BR')}</small>}<footer><button type="button" disabled={(secretForm[provider]||'').trim().length<8} onClick={()=>saveSecret(provider)}>{state.configured?'Atualizar chave':'Conectar'}</button>{state.configured&&<button type="button" className="danger" onClick={()=>deleteSecret(provider)}>Desconectar</button>}</footer></article>})}</div></section>)}
    <form className="channel-links logistics-settings" onSubmit={saveShippingSettings}><div><h3>Remetente e pacote padrão</h3><p>Usado nas cotações e etiquetas do Melhor Envio. Comece em Sandbox e troque para Produção somente após homologar.</p></div><div className="channel-links-grid">
      <label>Nome / Razão social<input value={shippingSettings.shipping_origin_name||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_name:event.target.value}))}/></label>
      <label>E-mail técnico<input type="email" value={shippingSettings.shipping_origin_email||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_email:event.target.value}))}/></label>
      <label>Telefone<input value={shippingSettings.shipping_origin_phone||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_phone:event.target.value}))}/></label>
      <label>CNPJ/CPF<input value={shippingSettings.shipping_origin_company_document||shippingSettings.shipping_origin_document||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_company_document:event.target.value}))}/></label>
      <label>Inscrição estadual<input value={shippingSettings.shipping_origin_state_register||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_state_register:event.target.value}))}/></label>
      <label>CEP<input value={shippingSettings.shipping_origin_zip_code||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_zip_code:event.target.value}))}/></label>
      <label>Rua<input value={shippingSettings.shipping_origin_street||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_street:event.target.value}))}/></label>
      <label>Número<input value={shippingSettings.shipping_origin_number||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_number:event.target.value}))}/></label>
      <label>Complemento<input value={shippingSettings.shipping_origin_complement||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_complement:event.target.value}))}/></label>
      <label>Bairro<input value={shippingSettings.shipping_origin_neighborhood||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_neighborhood:event.target.value}))}/></label>
      <label>Cidade<input value={shippingSettings.shipping_origin_city||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_city:event.target.value}))}/></label>
      <label>UF<input maxLength="2" value={shippingSettings.shipping_origin_state||''} onChange={event=>setShippingSettings(current=>({...current,shipping_origin_state:event.target.value.toUpperCase()}))}/></label>
      <label>Documento de postagem<select value={shippingSettings.shipping_document_mode||''} onChange={event=>setShippingSettings(current=>({...current,shipping_document_mode:event.target.value||null}))}><option value="">Selecione...</option><option value="invoice">NF-e</option><option value="declaration">Declaração de Conteúdo / DC-e</option></select></label>
      <label>Largura do pacote (cm)<input type="number" min="1" step="0.1" value={shippingSettings.shipping_package_width||''} onChange={event=>setShippingSettings(current=>({...current,shipping_package_width:event.target.value}))}/></label>
      <label>Altura do pacote (cm)<input type="number" min="1" step="0.1" value={shippingSettings.shipping_package_height||''} onChange={event=>setShippingSettings(current=>({...current,shipping_package_height:event.target.value}))}/></label>
      <label>Comprimento do pacote (cm)<input type="number" min="1" step="0.1" value={shippingSettings.shipping_package_length||''} onChange={event=>setShippingSettings(current=>({...current,shipping_package_length:event.target.value}))}/></label>
      <label>Peso padrão (kg)<input type="number" min="0.01" step="0.01" value={shippingSettings.shipping_package_weight||''} onChange={event=>setShippingSettings(current=>({...current,shipping_package_weight:event.target.value}))}/></label>
      <label>Ambiente<select value={shippingSettings.melhorenvio_sandbox===false?'production':'sandbox'} onChange={event=>setShippingSettings(current=>({...current,melhorenvio_sandbox:event.target.value==='sandbox'}))}><option value="sandbox">Sandbox</option><option value="production">Produção</option></select></label>
    </div><button className="shop-primary">Salvar logística</button></form>
    <form className="channel-links" onSubmit={saveSettings}><div><h3>Canais públicos</h3><p>Estes links aparecem no rodapé da loja e direcionam clientes aos seus perfis oficiais.</p></div><div className="channel-links-grid">{links.map(([key,label,placeholder])=><label key={key}>{label}<input type="url" inputMode="url" placeholder={placeholder} value={settings[key]||''} onChange={event=>setSettings(current=>({...current,[key]:event.target.value}))}/></label>)}<label>WhatsApp<input inputMode="tel" placeholder="5511999999999" value={settings.whatsapp||''} onChange={event=>setSettings(current=>({...current,whatsapp:event.target.value}))}/></label></div><button className="shop-primary">Salvar canais públicos</button></form>
  </section>;
}
