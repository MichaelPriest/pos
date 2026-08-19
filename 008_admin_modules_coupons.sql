-- Módulo administrativo de campanhas e cupons.
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  discount_type text not null check(discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null check(discount_value > 0),
  min_order_value numeric(10,2) not null default 0 check(min_order_value >= 0),
  usage_limit integer not null default 100 check(usage_limit > 0), used_count integer not null default 0,
  expires_at timestamptz, active boolean not null default true,
  created_by uuid default auth.uid() references profiles(id), created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
create policy "cupons publicos ativos" on public.coupons for select using(active=true or is_admin());
create policy "admin cria cupons" on public.coupons for insert with check(is_admin());
create policy "admin atualiza cupons" on public.coupons for update using(is_admin());
create policy "admin exclui cupons" on public.coupons for delete using(is_admin());
