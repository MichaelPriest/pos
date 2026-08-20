-- Perfil, comprovantes, cofre de integrações e logística.
alter table public.profiles add column if not exists avatar_url text;
alter table public.orders add column if not exists receipt_type text default 'nao_fiscal';
alter table public.orders add column if not exists customer_document text;
alter table public.orders add column if not exists shipping_service text;
alter table public.orders add column if not exists shipping_cost numeric(10,2) default 0;
create table if not exists public.integration_secrets(provider text primary key,encrypted_value text not null,updated_at timestamptz not null default now(),updated_by uuid default auth.uid() references profiles(id));
alter table public.integration_secrets enable row level security;
create or replace function public.update_my_avatar(p_avatar_url text) returns void language sql security definer set search_path=public as $$ update profiles set avatar_url=p_avatar_url where id=auth.uid(); $$;
-- integration_secrets não possui policy pública: acesso exclusivo pela API server-side com service_role.
