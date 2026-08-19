-- Lista de desejos persistente por cliente.
create table if not exists public.customer_favorites(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(customer_id,product_id)
);
create index if not exists customer_favorites_customer_idx on public.customer_favorites(customer_id,created_at desc);
alter table public.customer_favorites enable row level security;
drop policy if exists "cliente gerencia favoritos" on public.customer_favorites;
create policy "cliente gerencia favoritos" on public.customer_favorites for all to authenticated using(customer_id=auth.uid())with check(customer_id=auth.uid());
grant select,insert,delete on public.customer_favorites to authenticated;
