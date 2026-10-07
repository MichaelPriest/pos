-- Integração logística Melhor Envio: remetente, pacote padrão e rastreabilidade no pedido.

alter table public.store_settings add column if not exists shipping_origin_name text;
alter table public.store_settings add column if not exists shipping_origin_email text;
alter table public.store_settings add column if not exists shipping_origin_phone text;
alter table public.store_settings add column if not exists shipping_origin_document text;
alter table public.store_settings add column if not exists shipping_origin_company_document text;
alter table public.store_settings add column if not exists shipping_origin_state_register text;
alter table public.store_settings add column if not exists shipping_origin_zip_code text;
alter table public.store_settings add column if not exists shipping_origin_street text;
alter table public.store_settings add column if not exists shipping_origin_number text;
alter table public.store_settings add column if not exists shipping_origin_complement text;
alter table public.store_settings add column if not exists shipping_origin_neighborhood text;
alter table public.store_settings add column if not exists shipping_origin_city text;
alter table public.store_settings add column if not exists shipping_origin_state text;
alter table public.store_settings add column if not exists shipping_package_width numeric(8,2);
alter table public.store_settings add column if not exists shipping_package_height numeric(8,2);
alter table public.store_settings add column if not exists shipping_package_length numeric(8,2);
alter table public.store_settings add column if not exists shipping_package_weight numeric(8,3);
alter table public.store_settings add column if not exists melhorenvio_sandbox boolean not null default true;
alter table public.store_settings add column if not exists melhorenvio_auto_checkout boolean not null default false;

alter table public.orders add column if not exists shipping_provider text;
alter table public.orders add column if not exists shipping_service_id text;
alter table public.orders add column if not exists shipping_provider_shipment_id text;
alter table public.orders add column if not exists shipping_provider_status text;
alter table public.orders add column if not exists shipping_quote_amount numeric(10,2);
alter table public.orders add column if not exists shipping_quote_days integer;
alter table public.orders add column if not exists shipping_label_url text;
alter table public.orders add column if not exists shipping_provider_updated_at timestamptz;

create index if not exists orders_shipping_provider_shipment_id_idx
  on public.orders(shipping_provider_shipment_id)
  where shipping_provider_shipment_id is not null;

create index if not exists orders_shipping_provider_status_idx
  on public.orders(shipping_provider,shipping_provider_status)
  where shipping_provider is not null;
