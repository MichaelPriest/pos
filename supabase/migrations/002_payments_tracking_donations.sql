-- Execute após 001_store_customization.sql em instalações existentes.
alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists tracking_code text;
alter table public.orders add column if not exists carrier text;
alter table public.orders add column if not exists tracking_url text;
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(), donor_id uuid not null default auth.uid() references profiles(id),
  donor_name text not null, phone text not null, quantity integer not null check(quantity > 0), category text not null,
  condition text not null, pickup_method text not null, address text, notes text,
  images jsonb not null default '[]'::jsonb, status text not null default 'recebida',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.donations enable row level security;
create policy "cliente cria doacao" on public.donations for insert with check(donor_id=auth.uid());
create policy "cliente acompanha doacao" on public.donations for select using(donor_id=auth.uid() or public.is_admin());
create policy "admin gerencia doacao" on public.donations for update using(public.is_admin());
