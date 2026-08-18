# ReVeste — brechó online + gestão

Sistema real de loja online para brechó, com autenticação, catálogo, carrinho, pedidos, estoque e painel administrativo. O frontend é Next.js/React, o banco e a autenticação são fornecidos pelo Supabase e o deploy é compatível com Vercel.

## Funcionalidades

- Loja pública responsiva com busca, categorias, catálogo e carrinho.
- Cadastro e login de clientes com histórico de pedidos.
- Checkout transacional: o preço é calculado no banco e o estoque é baixado com trava contra vendas duplicadas.
- Painel admin protegido por perfil, com métricas, gráficos, produtos, pedidos e clientes.
- Editor visual da marca: nome, slogan, cores, logo e banner publicados em tempo real.
- Upload de fotos e logo em JPG, PNG ou WebP, salvos em Base64 diretamente no banco.
- Segurança por Row Level Security (RLS): clientes só acessam os próprios pedidos; somente admins alteram o catálogo.

## 1. Criar o banco

1. Crie um projeto gratuito em [Supabase](https://supabase.com).
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e execute. Se já instalou a versão anterior, execute somente `supabase/migrations/001_store_customization.sql`.
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
3. Cadastre `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em **Settings → Environment Variables**.
4. Faça um novo deploy. O comando padrão `npm run build` já está configurado.

## Rotas

| Rota | Acesso | Uso |
| --- | --- | --- |
| `/loja` | Público | Catálogo e carrinho |
| `/login` | Público | Login e cadastro |
| `/minha-conta` | Cliente autenticado | Pedidos e conta |
| `/admin` | Apenas admin | Gestão completa |
