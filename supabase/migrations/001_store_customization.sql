-- Execute apenas se você já instalou uma versão anterior do schema.sql.
create table if not exists public.store_settings (
  id smallint primary key default 1 check(id = 1), store_name text not null default 'ReVeste',
  tagline text not null default 'Estilo que renasce com você.', logo_url text,
  primary_color text not null default '#315d4a', accent_color text not null default '#b36f53',
  hero_title text not null default 'Estilo que renasce com você.',
  hero_subtitle text not null default 'Peças únicas, escolhidas com carinho para durar muitas histórias — inclusive a sua.',
  hero_image text, whatsapp text, instagram text, updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values(1) on conflict(id) do nothing;
alter table public.store_settings enable row level security;
create policy "configuracao publica" on public.store_settings for select using(true);
create policy "admin personaliza loja" on public.store_settings for update using(public.is_admin());
create policy "admin atualiza pedidos" on public.orders for update using(public.is_admin());
