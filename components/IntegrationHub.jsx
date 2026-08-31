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

export default function IntegrationHub({secrets,secretForm,setSecretForm,saveSecret,deleteSecret,settings,setSettings,saveSettings}) {
  const configured=integrationProviders.filter(provider=>secrets[provider]?.configured).length;
  return <section className="integration-hub">
    <header className="integration-hero"><div><p className="eyebrow">CENTRAL DE CONEXÕES</p><h2>Integrações</h2><span>Gerencie pagamentos, marketplaces, marketing e logística sem expor suas credenciais.</span></div><div className="integration-score"><b>{configured}/{integrationProviders.length}</b><small>conectadas</small></div></header>
    <div className="integration-security">🔒 As credenciais são criptografadas no servidor e nunca são enviadas de volta ao navegador.</div>
    <form className="payment-availability" onSubmit={saveSettings}><div><h3>Disponibilidade no checkout</h3><p>Ative somente serviços que já possuem uma credencial válida. As formas de pagamento definem o que o cliente verá.</p></div><div className="payment-provider-toggles">{[['mercadopago_enabled','Mercado Pago','mercadopago'],['stripe_enabled','Stripe','stripe'],['pagbank_enabled','PagBank','pagbank']].map(([key,label,provider])=><label className={!secrets[provider]?.configured?'unavailable':''} key={key}><input type="checkbox" checked={Boolean(settings[key])} disabled={!secrets[provider]?.configured} onChange={event=>setSettings(current=>({...current,[key]:event.target.checked}))}/><span><b>{label}</b><small>{secrets[provider]?.configured?'Credencial disponível':'Cadastre a credencial abaixo'}</small></span></label>)}</div><div className="checkout-methods"><label><input type="checkbox" checked={settings.pix_enabled!==false} onChange={event=>setSettings(current=>({...current,pix_enabled:event.target.checked}))}/> Oferecer Pix</label><label><input type="checkbox" checked={settings.card_enabled!==false} onChange={event=>setSettings(current=>({...current,card_enabled:event.target.checked}))}/> Oferecer cartão</label></div><button className="shop-primary">Salvar disponibilidade</button></form>
    {groups.map(group=><section className="integration-group" key={group.title}><div className="integration-group-title"><h3>{group.title}</h3><p>{group.description}</p></div><div className="integration-grid">{group.items.map(([provider,name,initials,description])=>{const state=secrets[provider]||{};return <article className={`integration-card ${state.configured?'connected':''}`} key={provider}><div className="integration-card-head"><i>{initials}</i><span><b>{name}</b><small>{description}</small></span><em>{state.configured?'Credencial salva':'Pendente'}</em></div><label>Token ou chave secreta<input type="password" autoComplete="new-password" value={secretForm[provider]||''} onChange={event=>setSecretForm(current=>({...current,[provider]:event.target.value}))} placeholder={state.configured?'Insira uma nova chave para substituir':'Cole a credencial da plataforma'}/></label>{state.updated_at&&<small className="integration-updated">Atualizada em {new Date(state.updated_at).toLocaleString('pt-BR')}</small>}<footer><button type="button" disabled={(secretForm[provider]||'').trim().length<8} onClick={()=>saveSecret(provider)}>{state.configured?'Atualizar chave':'Salvar chave'}</button>{state.configured&&<button type="button" className="danger" onClick={()=>deleteSecret(provider)}>Desconectar</button>}</footer></article>})}</div></section>)}
    <form className="channel-links" onSubmit={saveSettings}><div><h3>Canais públicos</h3><p>Estes links aparecem no rodapé da loja e direcionam clientes aos seus perfis oficiais.</p></div><div className="channel-links-grid">{links.map(([key,label,placeholder])=><label key={key}>{label}<input type="url" inputMode="url" placeholder={placeholder} value={settings[key]||''} onChange={event=>setSettings(current=>({...current,[key]:event.target.value}))}/></label>)}<label>WhatsApp<input inputMode="tel" placeholder="5511999999999" value={settings.whatsapp||''} onChange={event=>setSettings(current=>({...current,whatsapp:event.target.value}))}/></label></div><button className="shop-primary">Salvar canais públicos</button></form>
  </section>;
}
