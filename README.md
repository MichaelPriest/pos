# ReVeste — brechó online + gestão

Sistema real de loja online para brechó, com autenticação, catálogo, carrinho, pedidos, estoque e painel administrativo. O frontend usa Vite, React e React Router; o banco e a autenticação são fornecidos pelo Supabase e o deploy é compatível com Vercel.

### Arquitetura frontend

- **Vite** para desenvolvimento e build de produção.
- **React Router** para rotas públicas, rotas de clientes, rotas operacionais e parâmetros dinâmicos.
- Shell responsivo compartilhado nas telas internas, com sidebar fixa no desktop, compacta no tablet e navegação inferior no celular.
- Carregamento sob demanda por rota (`React.lazy`), fallback visual e Error Boundary para falhas isoladas de interface.
- Funções serverless em `api/` para credenciais, pagamentos e webhooks; nenhum segredo é incluído no bundle do Vite.

## Funcionalidades

- Loja pública responsiva com busca, categorias, catálogo e carrinho.
- Cadastro e login de clientes com histórico de pedidos.
- Endereços reutilizáveis e idempotentes: compras repetidas atualizam o mesmo endereço, permitem escolher o principal e não criam duplicatas.
- Checkout transacional: o preço é calculado no banco e o estoque é baixado com trava contra vendas duplicadas.
- Cupons integrados ao checkout com validação de validade, limite de usos, pedido mínimo e cálculo transacional no banco.
- Conciliação de pagamento por webhook e consulta direta à operadora: pedidos pendentes não entram no faturamento; cancelamentos devolvem o estoque de forma idempotente.
- Retomada segura de pagamentos pendentes pela conta do cliente, reutilizando a cobrança ainda aberta sem criar pedidos duplicados.
- Painel admin protegido por perfil, com métricas, gráficos, produtos, pedidos e clientes.
- Backoffice corporativo com financeiro, contas a pagar/receber, cadastro separado de funcionários, RH e ponto eletrônico com quatro marcações diárias.
- Editor visual da marca: nome, slogan, cores, logo e banner publicados em tempo real.
- Upload de fotos e logo em JPG, PNG ou WebP, salvos em Base64 diretamente no banco.
- Segurança por Row Level Security (RLS): clientes só acessam os próprios pedidos; somente admins alteram o catálogo.
- Pagamentos integrados por Stripe, Mercado Pago e PagBank, sem expor tokens no navegador.
- Rastreamento de entregas com transportadora, código e link visível na conta do cliente.
- Portal de doações com fotos, solicitação de coleta e acompanhamento pelo cliente e pela loja.
- PDV para vendas presenciais com busca, estoque em tempo real, desconto, cliente e Pix/cartão/dinheiro.
- Perfis separados para cliente, operador de caixa, estoque, gerente e administrador.
- Relatórios por período, indicadores, categorias mais vendidas e exportação CSV.
- Catálogo com filtros avançados por categoria, tamanho, faixa de preço e ordenação.
- Controle completo de caixa por operador: abertura, suprimento, sangria, vendas em dinheiro, conferência, diferença e fechamento.
- Configuração dos processadores e meios de pagamento sem expor a marca do gateway ao cliente.
- Linha do tempo de rastreamento, opções logísticas, etiquetas de embalagem e tabelas com pesquisa e paginação.
- Menu de perfil com foto e atalhos conforme o nível de acesso.
- Recibos não fiscais e espelho de cupom fiscal para impressão no PDV.
- Cofre criptografado de chaves de pagamento acessível somente pelo administrador.
- Modo manutenção que bloqueia o catálogo e todas as vendas online.
- Checkout completo com contato, CPF/CNPJ, endereço, frete, retirada e revisão do pagamento.
- Área do cliente isolada da equipe, com pedidos, rastreamento, endereços, doações e dados pessoais.
- Checkout idempotente contra pedidos duplicados, inclusive em duplo clique ou nova tentativa.
- Pedidos separados por status, com datatable pesquisável e paginada.
- Módulos administrativos dedicados para estoque, logística e campanhas de cupons.

## 1. Criar o banco

1. Crie um projeto gratuito em [Supabase](https://supabase.com).
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e execute. Se já instalou a versão anterior, execute, na ordem, as migrations `001`, `002`, `003`, `004`, `005`, `006`, `007` e `008` da pasta `supabase/migrations`.
3. Em **Authentication → URL Configuration**, informe a URL do site na Vercel.
4. Cadastre sua conta em `/login` e execute a última instrução comentada do schema, trocando pelo seu e-mail, para conceder o perfil `admin`.

## 2. Configurar localmente

```bash
cp .env.example .env.local
npm install
npm run dev
```

Em **Supabase → Project Settings → API**, copie a URL e a chave pública `anon` para `.env.local`. Nunca coloque a chave `service_role` no navegador.

## 3. GitHub e Vercel

1. Envie o repositório ao GitHub.
2. Importe-o na Vercel.
3. Cadastre todas as variáveis de `.env.example` em **Settings → Environment Variables**. As variáveis públicas do Vite usam o prefixo `VITE_`; os tokens privados continuam disponíveis somente nas funções `/api`.
4. No painel da Stripe, cadastre o webhook `https://SEU-SITE/api/payments/webhook?provider=stripe` e copie o segredo para `STRIPE_WEBHOOK_SECRET`. Mercado Pago e PagBank recebem a URL automaticamente.
   Selecione os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`. Eventos como `setup_intent.created` são autenticados e confirmados com HTTP 200, mas não alteram pedidos porque ainda não representam um pagamento.
   Em **Stripe → Settings → Business → Branding**, configure o nome público, logo, ícone e cores da loja. O texto exibido pelo Link, inclusive “Área restrita padrão”, vem do perfil comercial da conta Stripe e não pode ser substituído pela API. Em **Payment methods**, desative o Link caso queira exibir somente cartão.
5. Faça um novo deploy. O comando padrão `npm run build` já está configurado.

## Rotas

| Rota | Acesso | Uso |
| --- | --- | --- |
| `/loja` | Público | Catálogo e carrinho |
| `/login` | Público | Login e cadastro |
| `/minha-conta` | Somente cliente | Pedidos, endereços, doações e dados |
| `/checkout` | Somente cliente | Entrega, frete e pagamento |
| `/perfil` | Somente equipe | Perfil profissional isolado |
| `/admin` | Apenas admin | Gestão completa |
| `/doar` | Cliente autenticado | Doação e coleta de peças |
| `/pdv` | Admin, gerente ou caixa | Venda presencial |
| `/relatorios` | Admin ou gerente | Indicadores e exportação |
| `/caixa` | Admin, gerente ou caixa | Abertura, movimentação e fechamento |
| `/configuracoes` | Admin ou gerente | Configurações e identidade da loja |
| `/financeiro` | Admin ou gerente | Fluxo financeiro e lançamentos |
| `/equipe` | Apenas admin | Funcionários e acessos |
| `/rh` | Admin ou gerente | Quadro e indicadores de RH |
| `/ponto` | Equipe | Ponto eletrônico |

- Checkout com máscaras brasileiras e endereço automático via BrasilAPI.
- Canais configuráveis: Mercado Livre, Shopee, Meta, WhatsApp, X e TikTok.
