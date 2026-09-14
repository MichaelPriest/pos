import { useEffect,useState } from 'react';
import { useLocation } from 'react-router-dom';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import StoreBrand from '../components/StoreBrand';
import { db } from '../lib/supabase';

const documents={
  '/privacidade':{title:'Política de privacidade',intro:'Saiba como os dados necessários para sua conta e suas compras são tratados.',sections:[
    ['Dados utilizados','Usamos os dados informados no cadastro e no checkout, como nome, contato, documento e endereço, para autenticar sua conta, processar pedidos, pagamentos, entregas e atendimento.'],
    ['Compartilhamento','Dados são enviados apenas aos serviços necessários para concluir a operação, como processadores de pagamento, infraestrutura de hospedagem e parceiros de entrega. Não armazenamos os dados completos do seu cartão.'],
    ['Segurança e conservação','Aplicamos controles de acesso e mantemos os registros pelo período necessário à operação, segurança, prevenção a fraudes e cumprimento das obrigações aplicáveis.'],
    ['Seus dados','Você pode solicitar acesso, correção ou exclusão dos dados quando aplicável usando o canal de suporte informado nesta página.'],
  ]},
  '/termos':{title:'Termos de compra',intro:'Condições essenciais para comprar com segurança na ReVeste.',sections:[
    ['Produtos','As peças podem ser únicas e apresentar características próprias de itens seminovos. Fotos, descrição, tamanho, condição e disponibilidade devem ser conferidos antes da compra.'],
    ['Preço e pagamento','O valor definitivo é recalculado no servidor, incluindo descontos e entrega. O pedido só é confirmado depois da aprovação do processador de pagamento.'],
    ['Entrega','Prazo e modalidade são apresentados no checkout. O cliente é responsável por informar um endereço completo e acompanhar as atualizações disponibilizadas na conta.'],
    ['Cancelamentos','Pedidos pendentes podem expirar e ter o estoque liberado. Pedidos pagos seguem a política de trocas e devoluções e as regras aplicáveis ao meio de pagamento.'],
  ]},
  '/trocas-e-devolucoes':{title:'Trocas e devoluções',intro:'Orientações para solicitar atendimento depois da compra.',sections:[
    ['Como solicitar','Entre em contato pelo canal de suporte, informe o número do pedido e descreva o motivo da solicitação. Aguarde as instruções antes de enviar qualquer peça.'],
    ['Conservação da peça','Mantenha a peça sem sinais adicionais de uso, lavagem ou alteração e preserve etiquetas e acessórios recebidos para permitir a avaliação.'],
    ['Análise e reembolso','Após o recebimento, a loja avaliará a peça e informará a solução aplicável. Reembolsos aprovados são enviados ao mesmo meio de pagamento, respeitando o prazo de processamento da operadora.'],
    ['Problemas no pedido','Em caso de item divergente, avaria ou problema na entrega, envie fotos e detalhes pelo suporte assim que identificar a ocorrência.'],
  ]},
};

export default function LegalPage(){
  const {pathname}=useLocation(),document=documents[pathname]||documents['/termos'];
  const [settings,setSettings]=useState({store_name:'ReVeste'});
  useEffect(()=>{db.settings().then(value=>value&&setSettings(value)).catch(()=>{})},[]);
  const contact=settings.support_email||settings.whatsapp||'canal de atendimento informado na loja';
  return <main className="legal-page"><Head><title>{document.title} | {settings.store_name}</title></Head><header><Link href="/loja"><StoreBrand/></Link><Link href="/loja">← Voltar à loja</Link></header><article><p className="eyebrow">TRANSPARÊNCIA E CONFIANÇA</p><h1>{document.title}</h1><p className="legal-intro">{document.intro}</p>{document.sections.map(([title,text])=><section key={title}><h2>{title}</h2><p>{text}</p></section>)}<section><h2>Contato</h2><p>Para dúvidas ou solicitações, utilize: <strong>{contact}</strong>.</p></section><small>Última atualização: 14 de setembro de 2026.</small></article><footer><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de compra</Link><Link href="/trocas-e-devolucoes">Trocas e devoluções</Link></footer></main>;
}
