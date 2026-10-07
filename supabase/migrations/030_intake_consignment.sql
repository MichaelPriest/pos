-- Fluxo operacional de entrada, avaliação e consignação de peças.
-- Mantém peças fora do catálogo até aprovação explícita e gera repasse ao consignante após venda paga.

create table if not exists public.consignors(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  phone text,
  email text,
  pix_key text,
  payout_days integer not null default 7 check(payout_days between 0 and 90),
  notes text,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_intakes(
  id uuid primary key default gen_random_uuid(),
  source_type text not null check(source_type in('purchase','consignment','donation')),
  consignor_id uuid references public.consignors(id),
  status text not null default 'appraisal' check(status in('draft','appraisal','approved','rejected','closed')),
  notes text,
  received_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(source_type<>'consignment' or consignor_id is not null)
);

create table if not exists public.inventory_intake_items(
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.inventory_intakes(id) on delete cascade,
  product_id uuid unique references public.products(id) on delete set null,
  name text not null,
  description text,
  category text not null,
  brand text,
  size text not null,
  color text,
  condition_grade text not null check(condition_grade in('novo','excelente','bom','regular')),
  acquisition_cost numeric(10,2) not null default 0 check(acquisition_cost>=0),
  sale_price numeric(10,2) not null check(sale_price>0),
  store_commission_percent numeric(5,2) not null default 40 check(store_commission_percent between 0 and 100),
  images jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check(status in('pending','listed','rejected','sold','returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists sku text;
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists color text;
alter table public.products add column if not exists condition_grade text;
alter table public.products add column if not exists acquisition_type text;
alter table public.products add column if not exists acquisition_cost numeric(10,2) not null default 0;
alter table public.products add column if not exists consignor_id uuid references public.consignors(id) on delete set null;
alter table public.products add column if not exists intake_item_id uuid references public.inventory_intake_items(id) on delete set null;

create unique index if not exists products_sku_unique_idx on public.products(sku) where sku is not null;
create unique index if not exists products_barcode_unique_idx on public.products(barcode) where barcode is not null;
create index if not exists products_consignor_id_idx on public.products(consignor_id);
create index if not exists products_intake_item_id_idx on public.products(intake_item_id);
create index if not exists inventory_intakes_consignor_id_idx on public.inventory_intakes(consignor_id);
create index if not exists inventory_intakes_created_by_idx on public.inventory_intakes(created_by);
create index if not exists inventory_intake_items_intake_id_idx on public.inventory_intake_items(intake_id);

create table if not exists public.consignment_settlements(
  id uuid primary key default gen_random_uuid(),
  consignor_id uuid not null references public.consignors(id),
  intake_item_id uuid not null references public.inventory_intake_items(id),
  product_id uuid not null references public.products(id),
  order_id uuid not null references public.orders(id),
  order_item_id uuid not null unique references public.order_items(id),
  gross_amount numeric(10,2) not null check(gross_amount>=0),
  commission_percent numeric(5,2) not null check(commission_percent between 0 and 100),
  store_commission_amount numeric(10,2) not null check(store_commission_amount>=0),
  payout_amount numeric(10,2) not null check(payout_amount>=0),
  status text not null default 'pending' check(status in('pending','paid','cancelled')),
  available_at timestamptz not null,
  paid_at timestamptz,
  payment_reference text,
  financial_entry_id uuid references public.financial_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists consignment_settlements_consignor_id_idx on public.consignment_settlements(consignor_id);
create index if not exists consignment_settlements_order_id_idx on public.consignment_settlements(order_id);
create index if not exists consignment_settlements_status_available_idx on public.consignment_settlements(status,available_at);

alter table public.consignors enable row level security;
alter table public.inventory_intakes enable row level security;
alter table public.inventory_intake_items enable row level security;
alter table public.consignment_settlements enable row level security;

drop policy if exists "equipe gerencia consignantes" on public.consignors;
create policy "equipe gerencia consignantes" on public.consignors
  for all to authenticated
  using (has_system_role(array['admin','manager','inventory']))
  with check (has_system_role(array['admin','manager','inventory']));

drop policy if exists "equipe gerencia entradas" on public.inventory_intakes;
create policy "equipe gerencia entradas" on public.inventory_intakes
  for all to authenticated
  using (has_system_role(array['admin','manager','inventory']))
  with check (has_system_role(array['admin','manager','inventory']));

drop policy if exists "equipe gerencia itens entrada" on public.inventory_intake_items;
create policy "equipe gerencia itens entrada" on public.inventory_intake_items
  for all to authenticated
  using (has_system_role(array['admin','manager','inventory']))
  with check (has_system_role(array['admin','manager','inventory']));

drop policy if exists "gestao consulta repasses" on public.consignment_settlements;
create policy "gestao consulta repasses" on public.consignment_settlements
  for select to authenticated
  using (has_system_role(array['admin','manager']));

revoke all on table public.consignors,public.inventory_intakes,public.inventory_intake_items,public.consignment_settlements from anon;
grant select,insert,update on table public.consignors,public.inventory_intakes,public.inventory_intake_items to authenticated;
grant select on table public.consignment_settlements to authenticated;
grant select,insert,update,delete on table public.consignors,public.inventory_intakes,public.inventory_intake_items,public.consignment_settlements to service_role;

create or replace function public.approve_intake_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  item public.inventory_intake_items%rowtype;
  intake public.inventory_intakes%rowtype;
  product_id uuid;
  generated_sku text;
  first_image text;
begin
  if not has_system_role(array['admin','manager','inventory']) then
    raise exception 'Conta sem permissão para aprovar entradas';
  end if;

  select * into item from public.inventory_intake_items where id=p_item_id for update;
  if item.id is null then raise exception 'Peça de entrada não encontrada'; end if;
  if item.status='listed' and item.product_id is not null then return item.product_id; end if;
  if item.status<>'pending' then raise exception 'A peça não está disponível para aprovação'; end if;

  select * into intake from public.inventory_intakes where id=item.intake_id for update;
  if intake.id is null then raise exception 'Entrada não encontrada'; end if;
  if intake.source_type='consignment' and intake.consignor_id is null then
    raise exception 'Consignação exige proprietário vinculado';
  end if;

  generated_sku:='RV-'||upper(substr(replace(item.id::text,'-',''),1,10));
  if jsonb_typeof(item.images)='array' and jsonb_array_length(item.images)>0 then
    first_image:=nullif(item.images->>0,'');
  end if;

  insert into public.products(
    name,description,category,size,price,stock,image_url,active,
    sku,brand,color,condition_grade,acquisition_type,acquisition_cost,consignor_id,intake_item_id
  ) values(
    item.name,item.description,item.category,item.size,item.sale_price,1,first_image,true,
    generated_sku,item.brand,item.color,item.condition_grade,intake.source_type,item.acquisition_cost,intake.consignor_id,item.id
  ) returning id into product_id;

  update public.inventory_intake_items
     set product_id=product_id,status='listed',updated_at=now()
   where id=item.id;

  if not exists(
    select 1 from public.inventory_intake_items
    where intake_id=intake.id and status='pending'
  ) then
    update public.inventory_intakes set status='approved',updated_at=now() where id=intake.id;
  end if;

  return product_id;
end;
$$;

revoke all on function public.approve_intake_item(uuid) from public,anon;
grant execute on function public.approve_intake_item(uuid) to authenticated,service_role;

create or replace function public.create_consignment_settlements()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status<>'pago' then return new; end if;
  if tg_op='UPDATE' and old.status='pago' then return new; end if;

  insert into public.consignment_settlements(
    consignor_id,intake_item_id,product_id,order_id,order_item_id,
    gross_amount,commission_percent,store_commission_amount,payout_amount,available_at
  )
  select
    p.consignor_id,
    i.id,
    p.id,
    new.id,
    oi.id,
    round(oi.unit_price*oi.quantity,2),
    i.store_commission_percent,
    round((oi.unit_price*oi.quantity)*(i.store_commission_percent/100),2),
    round((oi.unit_price*oi.quantity)*(1-(i.store_commission_percent/100)),2),
    now()+make_interval(days=>coalesce(c.payout_days,7))
  from public.order_items oi
  join public.products p on p.id=oi.product_id
  join public.inventory_intake_items i on i.id=p.intake_item_id
  join public.consignors c on c.id=p.consignor_id
  where oi.order_id=new.id
    and p.acquisition_type='consignment'
    and p.consignor_id is not null
  on conflict(order_item_id) do nothing;

  update public.inventory_intake_items i
     set status='sold',updated_at=now()
   where i.product_id in(
     select oi.product_id from public.order_items oi where oi.order_id=new.id
   ) and exists(
     select 1 from public.products p
     where p.id=i.product_id and p.acquisition_type='consignment'
   );

  return new;
end;
$$;

drop trigger if exists create_consignment_settlement_on_order on public.orders;
create trigger create_consignment_settlement_on_order
after insert or update of status on public.orders
for each row execute function public.create_consignment_settlements();

revoke execute on function public.create_consignment_settlements() from public,anon,authenticated;

create or replace function public.pay_consignment_settlement(p_settlement_id uuid,p_payment_reference text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  settlement public.consignment_settlements%rowtype;
  owner_name text;
  entry_id uuid;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para registrar repasses';
  end if;

  select * into settlement from public.consignment_settlements where id=p_settlement_id for update;
  if settlement.id is null then raise exception 'Repasse não encontrado'; end if;
  if settlement.status='paid' then return settlement.financial_entry_id; end if;
  if settlement.status<>'pending' then raise exception 'Repasse não pode ser pago neste status'; end if;
  if settlement.available_at>now() then raise exception 'Repasse ainda não está liberado'; end if;

  select name into owner_name from public.consignors where id=settlement.consignor_id;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values(
    'expense','Repasse de consignação',
    'Repasse para '||coalesce(owner_name,'consignante'),
    settlement.payout_amount,current_date,now(),'paid'
  ) returning id into entry_id;

  update public.consignment_settlements
     set status='paid',paid_at=now(),payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),
         financial_entry_id=entry_id
   where id=settlement.id;

  return entry_id;
end;
$$;

revoke all on function public.pay_consignment_settlement(uuid,text) from public,anon;
grant execute on function public.pay_consignment_settlement(uuid,text) to authenticated,service_role;
