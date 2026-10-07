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
- Upload de fotos e logo em JPG, PNG ou WebP pelo Supabase Storage; o banco guarda apenas a URL ou referência do arquivo.
- Segurança por Row Level Security (RLS): clientes só acessam os próprios pedidos; somente admins alteram o catálogo.
- Sessões com renovação automática, webhooks idempotentes e trilha de auditoria administrativa para operações críticas.
- Pagamentos integrados por Stripe, Mercado Pago e PagBank, sem expor tokens no navegador.
- Rastreamento de entregas com transportadora, código e link visível na conta do cliente.
- Portal de doações com fotos, solicitação de coleta e acompanhamento pelo cliente e pela loja.
- PDV para vendas presenciais com busca, estoque em tempo real, desconto, cliente e Pix/cartão/dinheiro.
- Perfis separados para cliente, operador de caixa, estoque, gerente e administrador.
- Contador de notificações não lidas no menu do cliente, sincronizado após leitura e ao retornar para a loja, com histórico paginado.
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
- Entrada e avaliação de peças por compra própria, consignação ou doação, com SKU, origem e rastreabilidade até a venda.
- Consignação com cálculo automático de comissão/repasse e baixa integrada ao financeiro.
- Código de inventário por peça com fallback para itens legados, etiqueta Code 39 imprimível e leitura por SKU/código no PDV.
- Trocas e devoluções operacionais com recebimento físico, retorno opcional ao estoque, estorno automático Stripe e fallback manual para outros meios.
- Melhor Envio integrado no backoffice: cotação, carrinho, compra com confirmação explícita, geração, impressão, atualização de rastreio e despacho.
- Checkout com cotação temporária server-side do Melhor Envio, vinculada a cliente/CEP/sacola/cupom e consumida uma única vez; frete fixo permanece como fallback.
- Configuração de remetente, pacote e documento fiscal armazenada fora da tabela pública da loja, acessível somente por API administrativa/service role.

## 1. Criar o banco

1. Crie um projeto gratuito em [Supabase](https://supabase.com).
2. Em instalação nova, abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e execute. Em projeto existente, **não aplique migrations antigas por tentativa**. O projeto histórico do ReVeste foi criado por SQL direto e deve seguir o procedimento de adoção descrito em `supabase/MIGRATION_BASELINE.md` antes do primeiro `supabase db push`. As mudanças novas permanecem versionadas em `supabase/migrations`.
3. Em **Authentication → URL Configuration**, informe a URL do site na Vercel.
4. Cadastre sua conta em `/login` e execute a última instrução comentada do schema, trocando pelo seu e-mail, para conceder o perfil `admin`.

## 2. Configurar localmente

```bash
cp .env.example .env.local
npm install
npm run dev
```

Em **Supabase → Project Settings → API**, copie a URL e a chave pública `anon` para `.env.local`. Nunca coloque a chave `service_role` no navegador.

### Imagens e Supabase Storage

As migrations `015_storage_media.sql` e `016_private_donation_media.sql` criam buckets para catálogo, identidade visual, avatares e doações, com limites de tamanho, formatos permitidos e políticas por perfil. Fotos de doações ficam privadas e são exibidas por links temporários assinados. Os novos uploads guardam somente a URL ou referência do arquivo no banco, evitando o crescimento e a lentidão causados por Base64. Imagens antigas em Base64 continuam visíveis e podem ser migradas simplesmente reenviando o arquivo no painel.

## 3. GitHub e Vercel

1. Envie o repositório ao GitHub.
2. Importe-o na Vercel.
3. Cadastre todas as variáveis de `.env.example` em **Settings → Environment Variables**. As variáveis públicas do Vite usam o prefixo `VITE_`; os tokens privados continuam disponíveis somente nas funções `/api`.
4. No painel da Stripe, cadastre o webhook `https://SEU-SITE/api/payments/webhook?provider=stripe` e copie o segredo para `STRIPE_WEBHOOK_SECRET`. Mercado Pago e PagBank recebem a URL automaticamente.
   Selecione os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`. Eventos como `setup_intent.created` são autenticados e confirmados com HTTP 200, mas não alteram pedidos porque ainda não representam um pagamento.
   Em **Stripe → Settings → Business → Branding**, configure o nome público, logo, ícone e cores da loja. O texto exibido pelo Link, inclusive “Área restrita padrão”, vem do perfil comercial da conta Stripe e não pode ser substituído pela API. Em **Payment methods**, desative o Link caso queira exibir somente cartão.
5. Faça um novo deploy. O comando padrão `npm run build` já está configurado.
6. Configure `CRON_SECRET` na Vercel. A tarefa diária `/api/orders/expire` cancela reservas não pagas que já ultrapassaram 24 horas, devolvendo estoque e uso de cupom de forma transacional. Em planos que aceitem maior frequência, o agendamento pode ser alterado sem modificar a regra de expiração no banco.
7. Após o deploy, desative o modo manutenção e consulte `/api/health` para validar schema, autenticação, RPC atômica de webhooks, segredos operacionais e se ao menos um dos gateways habilitados possui credencial. Só libere vendas quando o endpoint responder `healthy` com HTTP 200. O GitHub Actions também executa testes e build a cada push e pull request.

O deploy aplica CSP, HSTS, proteção contra frames e políticas restritivas de recursos. O build de produção não publica source maps; caso um novo domínio externo seja usado diretamente pelo navegador, revise explicitamente a diretiva correspondente em `vercel.json` em vez de remover a CSP.

`SITE_URL` é obrigatória para cobranças e deve conter a origem HTTPS pública da loja, sem caminhos. Os webhooks do Mercado Pago e PagBank consultam a operadora com a credencial do cofre antes de conciliar o pedido; assim, o conteúdo recebido pela URL pública nunca é aceito isoladamente como confirmação de pagamento. A migration `027_atomic_webhook_claims.sql` impede processamento concorrente do mesmo evento e libera automaticamente, após cinco minutos, eventos interrompidos.

As rotas sensíveis de pagamento, conciliação, cadastro de funcionários e cofre possuem limite distribuído de requisições. A migration `020_api_rate_limits.sql` mantém os contadores no Supabase, funcionando mesmo quando a Vercel alterna entre diferentes instâncias serverless, e armazena apenas hashes dos endereços de origem.

O cadastro de funcionários possui compensação automática: se o perfil ou os dados funcionais falharem depois da criação no Supabase Auth, o usuário incompleto é removido. O cofre administrativo valida as respostas do banco, rejeita segredos inválidos e permite remover credenciais antigas com segurança.

O despacho é realizado pela RPC transacional `dispatch_order`: somente pedidos pagos podem ser enviados, e atualização do pedido, código de rastreio, histórico logístico e notificação do cliente são gravados na mesma transação.

## Rotas

| Rota | Acesso | Uso |
| --- | --- | --- |
| `/loja` | Público | Catálogo e carrinho |
| `/produto/:id` | Público | Detalhes, disponibilidade e inclusão persistente na sacola |
| `/favoritos` | Somente cliente | Lista de desejos persistente e sincronizada com a conta |
| `/notificacoes` | Somente cliente | Atualizações de pagamento, pedido e rastreamento |
| `/privacidade` | Público | Política de tratamento de dados |
| `/termos` | Público | Termos de compra da loja |
| `/trocas-e-devolucoes` | Público | Orientações de pós-venda |
| `/login` | Público | Login e cadastro |
| `/esqueci-senha` | Público | Solicitação segura de recuperação de senha |
| `/redefinir-senha` | Link de recuperação | Validação do token e cadastro da nova senha |
| `/minha-conta` | Somente cliente | Pedidos, endereços, doações e dados |
| `/checkout` | Somente cliente | Entrega, frete e pagamento |
| `/perfil` | Somente equipe | Perfil profissional isolado |
| `/equipe/:id` | Somente administrador | Cargo, permissão, salário e bloqueio do funcionário |
| `/admin` | Apenas admin | Gestão completa |\n| `/entradas` | Admin, gerente ou estoque | Entrada, avaliação e consignação de peças |\n| `/trocas` | Admin ou gerente | Trocas, devoluções e confirmação de reembolsos |
| `/doar` | Cliente autenticado | Doação e coleta de peças |
| `/pdv` | Admin, gerente ou caixa | Venda presencial |
| `/relatorios` | Admin ou gerente | Indicadores e exportação |
| `/caixa` | Admin, gerente ou caixa | Abertura, movimentação e fechamento |
| `/configuracoes` | Admin ou gerente | Configurações e identidade da loja |
| `/financeiro` | Admin ou gerente | Fluxo financeiro e lançamentos |
| `/equipe` | Apenas admin | Funcionários e acessos |
| `/rh` | Admin ou gerente | Quadro e indicadores de RH |
| `/ponto` | Equipe | Ponto eletrônico |
| `/auditoria` | Apenas admin | Histórico de alterações críticas |

- Checkout com máscaras brasileiras e endereço automático via BrasilAPI.
- Canais configuráveis: Mercado Livre, Shopee, Meta, WhatsApp, X e TikTok.

### Integridade do caixa e do estoque

As migrações `022_cash_and_inventory_integrity.sql` e `023_online_inventory_integrity.sql` impedem mais de um caixa aberto por operador, validam sangrias contra o saldo disponível e agrupam itens repetidos antes de reservar estoque no PDV e na loja online.

### Auditoria funcional

A migração `024_audit_composite_keys.sql` permite auditar registros com chaves como `profile_id`, corrigindo a edição de cadastros funcionais. A navegação administrativa permanece concentrada na barra lateral.

### Checkout e navegação administrativa

A migração `025_checkout_key_type.sql` corrige a comparação de `checkout_key` textual com UUID. A barra lateral administrativa organiza os módulos em grupos recolhíveis.

### Precificação segura do checkout

A migração `026_server_checkout_pricing.sql` iniciou a precificação server-side do checkout. As migrations `040_melhor_envio_logistics.sql` e `041_server_shipping_quotes.sql` adicionam a integração logística e fazem o banco validar a cotação temporária pelo cliente, CEP, subtotal, desconto e cupom antes de aceitar o frete. Em Sandbox, o checkout continua usando a tabela fixa; cotações reais ao cliente só são liberadas em Produção. A migration `042_private_shipping_settings.sql` move CNPJ/IE/endereço do remetente e dados de pacote para configuração privada service-only.

### Navegação global e RH

A área restrita possui grupos recolhíveis por domínio. A página de RH oferece pesquisa, filtros por departamento e situação, acesso ao cadastro funcional e exportação CSV do quadro exibido.

### Gestão financeira

A página financeira inclui contas a pagar e receber, pesquisa e filtros combináveis, identificação de vencimentos, baixa de lançamentos e exportação CSV do resultado filtrado.

### Integração entre caixa e financeiro

O financeiro consolida o saldo esperado dos caixas abertos, vendas em dinheiro, suprimentos, sangrias e diferenças dos fechamentos, sem contabilizar novamente vendas que já constam nos pedidos pagos.

### PDV e situação do caixa

O PDV mostra o saldo esperado e o estado do caixa no cabeçalho. Quando fechado, a tela permanece visível, mas um modal bloqueia novas vendas e oferece acesso direto à abertura do caixa. Na sidebar, somente a visão geral ou o grupo da rota atual inicia expandido.

### Relatórios avançados

Os relatórios permitem combinar período, pesquisa, status, canal e forma de pagamento, com indicadores derivados do resultado filtrado, rankings de categorias, status e pagamentos, além de exportação CSV.
