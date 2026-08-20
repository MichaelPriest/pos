-- Canais públicos configuráveis da marca e marketplaces externos.
alter table public.store_settings
  add column if not exists facebook text,
  add column if not exists x_url text,
  add column if not exists tiktok text,
  add column if not exists marketplace_mercadolivre text,
  add column if not exists marketplace_shopee text;
