-- Separa configuração sensível de logística da configuração pública da loja.
-- store_settings é publicamente legível; endereço/documentos do remetente ficam service-role only.

create table if not exists public.shipping_settings(
  id smallint primary key default 1 check(id=1),
  origin_name text,
  origin_email text,
  origin_phone text,
  origin_document text,
  origin_company_document text,
  origin_state_register text,
  origin_zip_code text,
  origin_street text,
  origin_number text,
  origin_complement text,
  origin_neighborhood text,
  origin_city text,
  origin_state text,
  package_width numeric(8,2),
  package_height numeric(8,2),
  package_length numeric(8,2),
  package_weight numeric(8,3),
  document_mode text check(document_mode in('declaration','invoice')),
  melhorenvio_sandbox boolean not null default true,
  melhorenvio_auto_checkout boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.shipping_settings(
  id,origin_name,origin_email,origin_phone,origin_document,origin_company_document,
  origin_state_register,origin_zip_code,origin_street,origin_number,origin_complement,
  origin_neighborhood,origin_city,origin_state,package_width,package_height,package_length,
  package_weight,document_mode,melhorenvio_sandbox,melhorenvio_auto_checkout
)
select
  id,shipping_origin_name,shipping_origin_email,shipping_origin_phone,shipping_origin_document,
  shipping_origin_company_document,shipping_origin_state_register,shipping_origin_zip_code,
  shipping_origin_street,shipping_origin_number,shipping_origin_complement,
  shipping_origin_neighborhood,shipping_origin_city,shipping_origin_state,
  shipping_package_width,shipping_package_height,shipping_package_length,shipping_package_weight,
  shipping_document_mode,melhorenvio_sandbox,melhorenvio_auto_checkout
from public.store_settings where id=1
on conflict(id) do update set
  origin_name=excluded.origin_name,
  origin_email=excluded.origin_email,
  origin_phone=excluded.origin_phone,
  origin_document=excluded.origin_document,
  origin_company_document=excluded.origin_company_document,
  origin_state_register=excluded.origin_state_register,
  origin_zip_code=excluded.origin_zip_code,
  origin_street=excluded.origin_street,
  origin_number=excluded.origin_number,
  origin_complement=excluded.origin_complement,
  origin_neighborhood=excluded.origin_neighborhood,
  origin_city=excluded.origin_city,
  origin_state=excluded.origin_state,
  package_width=excluded.package_width,
  package_height=excluded.package_height,
  package_length=excluded.package_length,
  package_weight=excluded.package_weight,
  document_mode=excluded.document_mode,
  melhorenvio_sandbox=excluded.melhorenvio_sandbox,
  melhorenvio_auto_checkout=excluded.melhorenvio_auto_checkout,
  updated_at=now();

alter table public.shipping_settings enable row level security;
revoke all on table public.shipping_settings from public,anon,authenticated;
grant select,insert,update,delete on table public.shipping_settings to service_role;

alter table public.store_settings
  drop column if exists shipping_origin_name,
  drop column if exists shipping_origin_email,
  drop column if exists shipping_origin_phone,
  drop column if exists shipping_origin_document,
  drop column if exists shipping_origin_company_document,
  drop column if exists shipping_origin_state_register,
  drop column if exists shipping_origin_zip_code,
  drop column if exists shipping_origin_street,
  drop column if exists shipping_origin_number,
  drop column if exists shipping_origin_complement,
  drop column if exists shipping_origin_neighborhood,
  drop column if exists shipping_origin_city,
  drop column if exists shipping_origin_state,
  drop column if exists shipping_package_width,
  drop column if exists shipping_package_height,
  drop column if exists shipping_package_length,
  drop column if exists shipping_package_weight,
  drop column if exists shipping_document_mode,
  drop column if exists melhorenvio_sandbox,
  drop column if exists melhorenvio_auto_checkout;
