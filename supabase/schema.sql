-- Execute este arquivo uma vez no SQL Editor do Supabase.
create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'manager', 'cashier', 'inventory', 'customer');
create type public.order_status as enum ('pendente', 'pago', 'separando', 'enviado', 'concluido', 'cancelado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', email text not null, role user_role not null default 'customer',
  phone text, created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  category text not null, size text not null, price numeric(10,2) not null check(price >= 0),
  stock integer not null default 1 check(stock >= 0), image_url text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references profiles(id),
  customer_name text not null, total numeric(10,2) not null check(total >= 0),
  status order_status not null default 'pendente', payment_method text not null default 'pix',
  shipping_address jsonb, created_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id), quantity integer not null check(quantity > 0),
  unit_price numeric(10,2) not null check(unit_price >= 0)
);
create table public.store_settings (
  id smallint primary key default 1 check(id = 1), store_name text not null default 'ReVeste',
  tagline text not null default 'Estilo que renasce com você.', logo_url text,
  primary_color text not null default '#315d4a', accent_color text not null default '#b36f53',
  hero_title text not null default 'Estilo que renasce com você.',
  hero_subtitle text not null default 'Peças únicas, escolhidas com carinho para durar muitas histórias — inclusive a sua.',
  hero_image text, whatsapp text, instagram text, support_email text, free_shipping_threshold numeric(10,2) default 250, pickup_enabled boolean default true, maintenance_mode boolean default false, seo_title text, seo_description text, updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values(1);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,name,email) values(new.id,coalesce(new.raw_user_meta_data->>'name',''),new.email); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=auth.uid() and role='admin');
$$;

create or replace function public.create_order(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; item jsonb; product_record products%rowtype; order_total numeric:=0; profile_name text;
begin
  if auth.uid() is null then raise exception 'Faça login para finalizar o pedido'; end if;
  if jsonb_array_length(payload->'items')=0 then raise exception 'A sacola está vazia'; end if;
  select name into profile_name from profiles where id=auth.uid();
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_record from products where id=(item->>'product_id')::uuid and active=true for update;
    if product_record.id is null or product_record.stock < (item->>'quantity')::int then raise exception 'Uma peça ficou indisponível'; end if;
    order_total:=order_total+(product_record.price*(item->>'quantity')::int);
  end loop;
  insert into orders(customer_id,customer_name,total,payment_method,shipping_address) values(auth.uid(),profile_name,order_total,coalesce(payload->>'payment_method','pix'),payload->'shipping_address') returning id into new_id;
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_record from products where id=(item->>'product_id')::uuid for update;
    insert into order_items(order_id,product_id,quantity,unit_price) values(new_id,product_record.id,(item->>'quantity')::int,product_record.price);
    update products set stock=stock-(item->>'quantity')::int,updated_at=now() where id=product_record.id;
  end loop;
  return new_id;
end; $$;

alter table profiles enable row level security; alter table products enable row level security;
alter table orders enable row level security; alter table order_items enable row level security;
alter table store_settings enable row level security;
create policy "perfil proprio" on profiles for select using(id=auth.uid() or is_admin());
create policy "admin gerencia perfis" on profiles for update using(is_admin());
create policy "catalogo publico" on products for select using(active=true or is_admin());
create policy "admin cadastra produtos" on products for insert with check(is_admin());
create policy "admin atualiza produtos" on products for update using(is_admin());
create policy "admin exclui produtos" on products for delete using(is_admin());
create policy "cliente ve pedidos" on orders for select using(customer_id=auth.uid() or is_admin());
create policy "admin atualiza pedidos" on orders for update using(is_admin());
create policy "cliente ve itens" on order_items for select using(exists(select 1 from orders where orders.id=order_id and (customer_id=auth.uid() or is_admin())));
create policy "configuracao publica" on store_settings for select using(true);
create policy "admin personaliza loja" on store_settings for update using(is_admin());

-- Depois de criar sua conta, torne-a administradora (troque o e-mail):
-- update public.profiles set role='admin' where email='seu@email.com';

-- Logística, pagamentos e doações
alter table public.orders add column payment_provider text;
alter table public.orders add column payment_reference text;
alter table public.orders add column tracking_code text;
alter table public.orders add column carrier text;
alter table public.orders add column tracking_url text;
create table public.donations (
  id uuid primary key default gen_random_uuid(), donor_id uuid not null default auth.uid() references profiles(id),
  donor_name text not null, phone text not null, quantity integer not null check(quantity > 0),
  category text not null, condition text not null, pickup_method text not null, address text,
  notes text, images jsonb not null default '[]'::jsonb, status text not null default 'recebida',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.donations enable row level security;
create policy "cliente cria doacao" on donations for insert with check(donor_id=auth.uid());
create policy "cliente acompanha doacao" on donations for select using(donor_id=auth.uid() or is_admin());
create policy "admin gerencia doacao" on donations for update using(is_admin());


-- Perfis de equipe, PDV e permissões de relatórios.

create or replace function public.has_system_role(allowed text[]) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=auth.uid() and role::text=any(allowed));
$$;
create policy "equipe consulta produtos" on public.products for select using(public.has_system_role(array['admin','manager','cashier','inventory']));
create policy "gerencia consulta pedidos" on public.orders for select using(public.has_system_role(array['admin','manager','cashier']));
create policy "gerencia consulta itens" on public.order_items for select using(public.has_system_role(array['admin','manager','cashier']));
create policy "gerencia consulta perfis" on public.profiles for select using(public.has_system_role(array['admin','manager']));
create policy "gerencia consulta doacoes" on public.donations for select using(public.has_system_role(array['admin','manager']));

create or replace function public.create_pos_order(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; item jsonb; product_record products%rowtype; subtotal numeric:=0; discount numeric:=0;
begin
  if not has_system_role(array['admin','manager','cashier']) then raise exception 'Acesso ao caixa não autorizado'; end if;
  if jsonb_array_length(payload->'items')=0 then raise exception 'Adicione pelo menos um produto'; end if;
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_record from products where id=(item->>'product_id')::uuid and active=true for update;
    if product_record.id is null or product_record.stock < (item->>'quantity')::int then raise exception 'Produto sem estoque'; end if;
    subtotal:=subtotal+(product_record.price*(item->>'quantity')::int);
  end loop;
  discount:=greatest(0,least(coalesce((payload->>'discount')::numeric,0),subtotal));
  insert into orders(customer_id,customer_name,total,status,payment_method,payment_provider)
    values(auth.uid(),coalesce(nullif(payload->>'customer_name',''),'Consumidor final'),subtotal-discount,'pago',coalesce(payload->>'payment_method','dinheiro'),'pdv') returning id into new_id;
  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into product_record from products where id=(item->>'product_id')::uuid for update;
    insert into order_items(order_id,product_id,quantity,unit_price) values(new_id,product_record.id,(item->>'quantity')::int,product_record.price);
    update products set stock=stock-(item->>'quantity')::int,updated_at=now() where id=product_record.id;
  end loop;
  return new_id;
end; $$;
-- Caixa completo, eventos de rastreio e meios de pagamento configuráveis.
alter table public.store_settings add column if not exists stripe_enabled boolean default false;
alter table public.store_settings add column if not exists mercadopago_enabled boolean default true;
alter table public.store_settings add column if not exists pagbank_enabled boolean default false;
alter table public.store_settings add column if not exists pix_enabled boolean default true;
alter table public.store_settings add column if not exists card_enabled boolean default true;
alter table public.store_settings add column if not exists cash_enabled boolean default true;
create table if not exists public.cash_sessions(id uuid primary key default gen_random_uuid(),operator_id uuid not null references profiles(id),opening_balance numeric(10,2) not null default 0,status text not null default 'open',opened_at timestamptz not null default now(),closed_at timestamptz,expected_balance numeric(10,2),counted_balance numeric(10,2),difference numeric(10,2),closing_notes text);
create table if not exists public.cash_movements(id uuid primary key default gen_random_uuid(),session_id uuid not null references cash_sessions(id) on delete cascade,operator_id uuid not null references profiles(id),type text not null check(type in('sale','supply','withdrawal')),amount numeric(10,2) not null check(amount>=0),reason text,order_id uuid references orders(id),created_at timestamptz not null default now());
create table if not exists public.tracking_events(id uuid primary key default gen_random_uuid(),order_id uuid not null references orders(id) on delete cascade,status text not null,description text not null,location text,occurred_at timestamptz not null default now(),created_by uuid default auth.uid() references profiles(id));
alter table public.cash_sessions enable row level security;alter table public.cash_movements enable row level security;alter table public.tracking_events enable row level security;
create policy "equipe ve caixas" on public.cash_sessions for select using(operator_id=auth.uid() or has_system_role(array['admin','manager']));
create policy "equipe ve movimentos" on public.cash_movements for select using(operator_id=auth.uid() or has_system_role(array['admin','manager']));
create policy "cliente ve rastreio" on public.tracking_events for select using(exists(select 1 from orders where orders.id=order_id and(customer_id=auth.uid() or has_system_role(array['admin','manager']))));
create policy "equipe registra rastreio" on public.tracking_events for insert with check(has_system_role(array['admin','manager']));
create or replace function public.open_cash_session(p_opening_balance numeric) returns uuid language plpgsql security definer set search_path=public as $$ declare new_id uuid;begin if not has_system_role(array['admin','manager','cashier']) then raise exception 'Acesso negado';end if;if exists(select 1 from cash_sessions where operator_id=auth.uid() and status='open')then raise exception 'Você já possui um caixa aberto';end if;insert into cash_sessions(operator_id,opening_balance)values(auth.uid(),greatest(p_opening_balance,0))returning id into new_id;return new_id;end;$$;
create or replace function public.add_cash_movement(p_movement_type text,p_amount numeric,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$ declare sid uuid;mid uuid;begin select id into sid from cash_sessions where operator_id=auth.uid() and status='open' order by opened_at desc limit 1;if sid is null then raise exception 'Abra o caixa primeiro';end if;if p_movement_type not in('supply','withdrawal')then raise exception 'Movimento inválido';end if;insert into cash_movements(session_id,operator_id,type,amount,reason)values(sid,auth.uid(),p_movement_type,greatest(p_amount,0),p_reason)returning id into mid;return mid;end;$$;
create or replace function public.close_cash_session(p_counted_balance numeric,p_closing_notes text) returns uuid language plpgsql security definer set search_path=public as $$ declare s cash_sessions%rowtype;expected numeric;begin select * into s from cash_sessions where operator_id=auth.uid() and status='open' order by opened_at desc limit 1 for update;if s.id is null then raise exception 'Nenhum caixa aberto';end if;select s.opening_balance+coalesce(sum(case when type in('sale','supply')then amount else -amount end),0)into expected from cash_movements where session_id=s.id;update cash_sessions set status='closed',closed_at=now(),expected_balance=expected,counted_balance=p_counted_balance,difference=p_counted_balance-expected,closing_notes=p_closing_notes where id=s.id;return s.id;end;$$;

-- A definição final do PDV exige caixa aberto e registra vendas em dinheiro.
begin if not has_system_role(array['admin','manager','cashier'])then raise exception 'Acesso ao caixa não autorizado';end if;select id into sid from cash_sessions where operator_id=auth.uid()and status='open' order by opened_at desc limit 1;if sid is null then raise exception 'Abra o caixa antes de realizar vendas';end if;if jsonb_array_length(payload->'items')=0 then raise exception 'Adicione um produto';end if;for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid and active=true for update;if product_record.id is null or product_record.stock<(item->>'quantity')::int then raise exception 'Produto sem estoque';end if;subtotal:=subtotal+product_record.price*(item->>'quantity')::int;end loop;discount:=greatest(0,least(coalesce((payload->>'discount')::numeric,0),subtotal));method:=coalesce(payload->>'payment_method','dinheiro');insert into orders(customer_id,customer_name,total,status,payment_method,payment_provider)values(auth.uid(),coalesce(nullif(payload->>'customer_name',''),'Consumidor final'),subtotal-discount,'pago',method,'pdv')returning id into new_id;update orders set receipt_type=coalesce(payload->>'receipt_type','nao_fiscal'),customer_document=nullif(payload->>'customer_document','') where id=new_id;for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid for update;insert into order_items(order_id,product_id,quantity,unit_price)values(new_id,product_record.id,(item->>'quantity')::int,product_record.price);update products set stock=stock-(item->>'quantity')::int,updated_at=now()where id=product_record.id;end loop;if method='dinheiro'then insert into cash_movements(session_id,operator_id,type,amount,reason,order_id)values(sid,auth.uid(),'sale',subtotal-discount,'Venda presencial',new_id);end if;return new_id;end;$$;

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
-- Dados completos do cliente, endereços e checkout com frete.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists document text;
create table if not exists public.customer_addresses(id uuid primary key default gen_random_uuid(),customer_id uuid not null default auth.uid() references profiles(id) on delete cascade,label text default 'Principal',zip_code text not null,street text not null,number text not null,complement text,neighborhood text not null,city text not null,state text not null,is_default boolean default false,created_at timestamptz not null default now());
alter table public.customer_addresses enable row level security;
create policy "cliente ve enderecos" on public.customer_addresses for select using(customer_id=auth.uid());
create policy "cliente cria enderecos" on public.customer_addresses for insert with check(customer_id=auth.uid() and exists(select 1 from profiles where id=auth.uid() and role='customer'));
create policy "cliente exclui enderecos" on public.customer_addresses for delete using(customer_id=auth.uid());
create or replace function public.update_my_details(p_name text,p_phone text,p_document text) returns void language plpgsql security definer set search_path=public as $$ begin if not exists(select 1 from profiles where id=auth.uid() and role='customer')then raise exception 'Conta não pertence a um cliente';end if;update profiles set name=p_name,phone=p_phone,document=p_document where id=auth.uid();end;$$;
create or replace function public.create_order(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;item jsonb;product_record products%rowtype;order_total numeric:=0;freight numeric:=0;profile_name text;
begin if auth.uid()is null or not exists(select 1 from profiles where id=auth.uid()and role='customer')then raise exception 'Entre com uma conta de cliente';end if;if jsonb_array_length(payload->'items')=0 then raise exception 'A sacola está vazia';end if;select name into profile_name from profiles where id=auth.uid();for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid and active=true for update;if product_record.id is null or product_record.stock<(item->>'quantity')::int then raise exception 'Uma peça ficou indisponível';end if;order_total:=order_total+product_record.price*(item->>'quantity')::int;end loop;freight:=greatest(coalesce((payload->>'shipping_cost')::numeric,0),0);insert into orders(customer_id,customer_name,total,payment_method,shipping_address,shipping_service,shipping_cost)values(auth.uid(),profile_name,order_total+freight,coalesce(payload->>'payment_method','pix'),payload->'shipping_address',payload->>'shipping_method',freight)returning id into new_id;for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid for update;insert into order_items(order_id,product_id,quantity,unit_price)values(new_id,product_record.id,(item->>'quantity')::int,product_record.price);update products set stock=stock-(item->>'quantity')::int,updated_at=now()where id=product_record.id;end loop;return new_id;end;$$;
-- Impede pedidos duplicados por duplo clique, lentidão ou nova tentativa do checkout.
alter table public.orders add column if not exists checkout_key text;
create unique index if not exists orders_customer_checkout_key_unique on public.orders(customer_id,checkout_key) where checkout_key is not null;
create or replace function public.create_order(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;item jsonb;product_record products%rowtype;order_total numeric:=0;freight numeric:=0;profile_name text;request_key text;
begin if auth.uid()is null or not exists(select 1 from profiles where id=auth.uid()and role='customer')then raise exception 'Entre com uma conta de cliente';end if;request_key:=nullif(payload->>'checkout_key','');if request_key is not null then select id into new_id from orders where customer_id=auth.uid()and checkout_key=request_key;if new_id is not null then return new_id;end if;end if;if jsonb_array_length(payload->'items')=0 then raise exception 'A sacola está vazia';end if;select name into profile_name from profiles where id=auth.uid();for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid and active=true for update;if product_record.id is null or product_record.stock<(item->>'quantity')::int then raise exception 'Uma peça ficou indisponível';end if;order_total:=order_total+product_record.price*(item->>'quantity')::int;end loop;freight:=greatest(coalesce((payload->>'shipping_cost')::numeric,0),0);insert into orders(customer_id,customer_name,total,payment_method,shipping_address,shipping_service,shipping_cost,checkout_key)values(auth.uid(),profile_name,order_total+freight,coalesce(payload->>'payment_method','pix'),payload->'shipping_address',payload->>'shipping_method',freight,request_key)returning id into new_id;for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid for update;insert into order_items(order_id,product_id,quantity,unit_price)values(new_id,product_record.id,(item->>'quantity')::int,product_record.price);update products set stock=stock-(item->>'quantity')::int,updated_at=now()where id=product_record.id;end loop;return new_id;exception when unique_violation then select id into new_id from orders where customer_id=auth.uid()and checkout_key=request_key;return new_id;end;$$;
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
-- Canais públicos configuráveis da marca e marketplaces externos.
alter table public.store_settings
  add column if not exists facebook text,
  add column if not exists x_url text,
  add column if not exists tiktok text,
  add column if not exists marketplace_mercadolivre text,
  add column if not exists marketplace_shopee text;
-- Conciliação idempotente: somente o backend confirma pagamento e devolve estoque ao cancelar.
alter table public.orders
  add column if not exists payment_checked_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create or replace function public.reconcile_order_payment(p_order_id uuid,p_status text,p_reference text default null)
returns order_status language plpgsql security definer set search_path=public as $$
declare current_status order_status; next_status order_status; item record;
begin
  select status into current_status from orders where id=p_order_id for update;
  if current_status is null then raise exception 'Pedido não encontrado'; end if;
  next_status:=case when p_status='pago' then 'pago'::order_status when p_status='cancelado' then 'cancelado'::order_status else current_status end;
  -- Uma notificação atrasada nunca rebaixa um pedido já pago ou em expedição.
  if current_status in ('pago','separando','enviado','concluido') then next_status:=current_status; end if;
  if current_status='pendente' and next_status='cancelado' then
    for item in select product_id,quantity from order_items where order_id=p_order_id and product_id is not null loop
      update products set stock=stock+item.quantity,updated_at=now() where id=item.product_id;
    end loop;
  end if;
  update orders set status=next_status,payment_reference=coalesce(nullif(p_reference,''),payment_reference),payment_checked_at=now(),paid_at=case when next_status='pago' then coalesce(paid_at,now()) else paid_at end,cancelled_at=case when next_status='cancelado' then coalesce(cancelled_at,now()) else cancelled_at end where id=p_order_id;
  return next_status;
end;$$;
revoke all on function public.reconcile_order_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_order_payment(uuid,text,text) to service_role;
-- Financeiro, cadastro profissional e ponto eletrônico.
create table if not exists public.financial_entries(
 id uuid primary key default gen_random_uuid(),type text not null check(type in('income','expense')),category text not null,description text not null,amount numeric(12,2) not null check(amount>0),due_date date not null,paid_at timestamptz,status text not null default 'pending' check(status in('pending','paid','cancelled')),created_by uuid references profiles(id) default auth.uid(),created_at timestamptz not null default now()
);
create table if not exists public.employee_details(
 profile_id uuid primary key references profiles(id) on delete cascade,job_title text,department text default 'Loja',admission_date date,salary numeric(12,2),employment_status text not null default 'active' check(employment_status in('active','leave','terminated')),notes text,updated_at timestamptz not null default now()
);
create table if not exists public.time_entries(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references profiles(id) on delete cascade,clock_in timestamptz not null default now(),clock_out timestamptz,notes text,created_at timestamptz not null default now(),check(clock_out is null or clock_out>=clock_in)
);
alter table financial_entries enable row level security;alter table employee_details enable row level security;alter table time_entries enable row level security;
create policy "gestao financeiro" on financial_entries for all using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "gestao ve rh" on employee_details for select using(profile_id=auth.uid() or has_system_role(array['admin','manager']));
create policy "admin gerencia rh" on employee_details for all using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "equipe ve ponto" on time_entries for select using(employee_id=auth.uid() or has_system_role(array['admin','manager']));
create policy "gestao corrige ponto" on time_entries for all using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create or replace function public.toggle_time_clock(p_notes text default null) returns jsonb language plpgsql security definer set search_path=public as $$declare open_entry time_entries%rowtype;begin if not has_system_role(array['admin','manager','cashier','inventory'])then raise exception 'Conta sem acesso ao ponto';end if;select*into open_entry from time_entries where employee_id=auth.uid() and clock_out is null order by clock_in desc limit 1 for update;if open_entry.id is null then insert into time_entries(employee_id,notes)values(auth.uid(),p_notes)returning*into open_entry;return jsonb_build_object('action','clock_in','id',open_entry.id,'at',open_entry.clock_in);else update time_entries set clock_out=now(),notes=coalesce(nullif(p_notes,''),notes)where id=open_entry.id returning*into open_entry;return jsonb_build_object('action','clock_out','id',open_entry.id,'at',open_entry.clock_out);end if;end;$$;
grant execute on function public.toggle_time_clock(text) to authenticated;
-- Endereços idempotentes: uma nova compra atualiza o endereço existente em vez de duplicá-lo.
with ranked as (
  select id,row_number() over(partition by customer_id,regexp_replace(zip_code,'\D','','g'),lower(trim(street)),lower(trim(number)),lower(trim(coalesce(complement,''))) order by is_default desc,created_at desc) position
  from public.customer_addresses
)
delete from public.customer_addresses where id in(select id from ranked where position>1);

with defaults as (
 select id,row_number() over(partition by customer_id order by created_at desc) position from public.customer_addresses where is_default=true
)
update public.customer_addresses set is_default=false where id in(select id from defaults where position>1);

create unique index if not exists customer_addresses_unique_location
on public.customer_addresses(customer_id,regexp_replace(zip_code,'\D','','g'),lower(trim(street)),lower(trim(number)),lower(trim(coalesce(complement,''))));
create unique index if not exists customer_addresses_one_default on public.customer_addresses(customer_id) where is_default=true;

create or replace function public.save_customer_address(p_address jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare address_id uuid;make_default boolean:=coalesce((p_address->>'is_default')::boolean,false);normalized_zip text:=regexp_replace(coalesce(p_address->>'zip_code',''),'\D','','g');
begin
 if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role='customer')then raise exception 'Conta de cliente necessária';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if length(normalized_zip)<>8 or nullif(trim(p_address->>'street'),'')is null or nullif(trim(p_address->>'number'),'')is null then raise exception 'Endereço incompleto';end if;
 select id into address_id from customer_addresses where customer_id=auth.uid() and regexp_replace(zip_code,'\D','','g')=normalized_zip and lower(trim(street))=lower(trim(p_address->>'street')) and lower(trim(number))=lower(trim(p_address->>'number')) and lower(trim(coalesce(complement,'')))=lower(trim(coalesce(p_address->>'complement',''))) limit 1;
 if make_default then update customer_addresses set is_default=false where customer_id=auth.uid() and is_default=true and id is distinct from address_id;end if;
 if address_id is null then
  insert into customer_addresses(customer_id,label,zip_code,street,number,complement,neighborhood,city,state,is_default)values(auth.uid(),coalesce(nullif(trim(p_address->>'label'),''),'Principal'),normalized_zip,trim(p_address->>'street'),trim(p_address->>'number'),nullif(trim(p_address->>'complement'),''),trim(p_address->>'neighborhood'),trim(p_address->>'city'),upper(trim(p_address->>'state')),make_default)returning id into address_id;
 else
  update customer_addresses set label=coalesce(nullif(trim(p_address->>'label'),''),label),zip_code=normalized_zip,street=trim(p_address->>'street'),number=trim(p_address->>'number'),complement=nullif(trim(p_address->>'complement'),''),neighborhood=trim(p_address->>'neighborhood'),city=trim(p_address->>'city'),state=upper(trim(p_address->>'state')),is_default=make_default where id=address_id;
 end if;
 return address_id;
end;$$;
grant execute on function public.save_customer_address(jsonb) to authenticated;
-- Cupons transacionais e jornada brasileira com quatro marcações diárias.
alter table public.orders add column if not exists subtotal numeric(10,2),add column if not exists discount numeric(10,2) not null default 0,add column if not exists coupon_code text;
create or replace function public.validate_coupon(p_code text,p_subtotal numeric) returns jsonb language plpgsql security definer set search_path=public as $$declare c coupons%rowtype;benefit numeric:=0;begin select*into c from coupons where code=upper(trim(p_code)) and active=true and(expires_at is null or expires_at>now()) and used_count<usage_limit;if c.id is null then raise exception 'Cupom inválido, esgotado ou expirado';end if;if p_subtotal<c.min_order_value then raise exception 'Pedido mínimo de R$ %',c.min_order_value;end if;benefit:=case when c.discount_type='percentage' then p_subtotal*c.discount_value/100 else c.discount_value end;benefit:=least(p_subtotal,greatest(0,benefit));return jsonb_build_object('code',c.code,'discount',round(benefit,2),'type',c.discount_type,'value',c.discount_value);end;$$;
grant execute on function public.validate_coupon(text,numeric) to authenticated;
create or replace function public.create_order(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$declare new_id uuid;item jsonb;product_record products%rowtype;order_subtotal numeric:=0;freight numeric:=0;discount_value numeric:=0;profile_name text;request_key uuid;coupon_record coupons%rowtype;coupon text:=upper(trim(coalesce(payload->>'coupon_code','')));begin if auth.uid()is null or not exists(select 1 from profiles where id=auth.uid()and role='customer')then raise exception 'Entre com uma conta de cliente';end if;request_key:=nullif(payload->>'checkout_key','')::uuid;if request_key is not null then select id into new_id from orders where customer_id=auth.uid()and checkout_key=request_key;if new_id is not null then return new_id;end if;end if;if jsonb_array_length(payload->'items')=0 then raise exception 'A sacola está vazia';end if;select name into profile_name from profiles where id=auth.uid();for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid and active=true for update;if product_record.id is null or product_record.stock<(item->>'quantity')::int then raise exception 'Uma peça ficou indisponível';end if;order_subtotal:=order_subtotal+product_record.price*(item->>'quantity')::int;end loop;if coupon<>'' then select*into coupon_record from coupons where code=coupon and active=true and(expires_at is null or expires_at>now()) and used_count<usage_limit for update;if coupon_record.id is null then raise exception 'Cupom inválido, esgotado ou expirado';end if;if order_subtotal<coupon_record.min_order_value then raise exception 'Valor mínimo do cupom não atingido';end if;discount_value:=case when coupon_record.discount_type='percentage' then order_subtotal*coupon_record.discount_value/100 else coupon_record.discount_value end;discount_value:=round(least(order_subtotal,greatest(0,discount_value)),2);update coupons set used_count=used_count+1 where id=coupon_record.id;end if;freight:=greatest(coalesce((payload->>'shipping_cost')::numeric,0),0);insert into orders(customer_id,customer_name,subtotal,discount,total,status,payment_method,shipping_address,shipping_service,shipping_cost,checkout_key,coupon_code)values(auth.uid(),profile_name,order_subtotal,discount_value,order_subtotal-discount_value+freight,'pendente',coalesce(payload->>'payment_method','pix'),payload->'shipping_address',payload->>'shipping_method',freight,request_key,nullif(coupon,''))returning id into new_id;for item in select*from jsonb_array_elements(payload->'items')loop select*into product_record from products where id=(item->>'product_id')::uuid for update;insert into order_items(order_id,product_id,quantity,unit_price)values(new_id,product_record.id,(item->>'quantity')::int,product_record.price);update products set stock=stock-(item->>'quantity')::int,updated_at=now()where id=product_record.id;end loop;return new_id;exception when unique_violation then select id into new_id from orders where customer_id=auth.uid()and checkout_key=request_key;return new_id;end;$$;
create or replace function public.toggle_time_clock(p_notes text default null) returns jsonb language plpgsql security definer set search_path=public as $$declare open_entry time_entries%rowtype;marks integer;begin if not has_system_role(array['admin','manager','cashier','inventory'])then raise exception 'Conta sem acesso ao ponto';end if;perform pg_advisory_xact_lock(hashtext(auth.uid()::text));select count(*)into marks from(select clock_in from time_entries where employee_id=auth.uid()and clock_in::date=current_date union all select clock_out from time_entries where employee_id=auth.uid()and clock_out::date=current_date and clock_out is not null)x;select*into open_entry from time_entries where employee_id=auth.uid()and clock_out is null order by clock_in desc limit 1 for update;if open_entry.id is null then if marks>=4 then raise exception 'As quatro marcações de hoje já foram registradas';end if;insert into time_entries(employee_id,notes)values(auth.uid(),p_notes)returning*into open_entry;return jsonb_build_object('action','clock_in','id',open_entry.id,'at',open_entry.clock_in,'mark',marks+1);else if marks>=4 then raise exception 'As quatro marcações de hoje já foram registradas';end if;update time_entries set clock_out=now(),notes=coalesce(nullif(p_notes,''),notes)where id=open_entry.id returning*into open_entry;return jsonb_build_object('action','clock_out','id',open_entry.id,'at',open_entry.clock_out,'mark',marks+1);end if;end;$$;
create or replace function public.reconcile_order_payment(p_order_id uuid,p_status text,p_reference text default null)returns order_status language plpgsql security definer set search_path=public as $$declare current_order orders%rowtype;next_status order_status;item record;begin select*into current_order from orders where id=p_order_id for update;if current_order.id is null then raise exception 'Pedido não encontrado';end if;next_status:=case when p_status='pago'then'pago'::order_status when p_status='cancelado'then'cancelado'::order_status else current_order.status end;if current_order.status in('pago','separando','enviado','concluido')then next_status:=current_order.status;end if;if current_order.status='pendente'and next_status='cancelado'then for item in select product_id,quantity from order_items where order_id=p_order_id and product_id is not null loop update products set stock=stock+item.quantity,updated_at=now()where id=item.product_id;end loop;if current_order.coupon_code is not null then update coupons set used_count=greatest(0,used_count-1)where code=current_order.coupon_code;end if;end if;update orders set status=next_status,payment_reference=coalesce(nullif(p_reference,''),payment_reference),payment_checked_at=now(),paid_at=case when next_status='pago'then coalesce(paid_at,now())else paid_at end,cancelled_at=case when next_status='cancelado'then coalesce(cancelled_at,now())else cancelled_at end where id=p_order_id;return next_status;end;$$;
revoke all on function public.reconcile_order_payment(uuid,text,text)from public,anon,authenticated;grant execute on function public.reconcile_order_payment(uuid,text,text)to service_role;
-- Segurança operacional, auditoria e idempotência de notificações externas.
create table if not exists public.webhook_events(id uuid primary key default gen_random_uuid(),provider text not null,event_id text not null,payload jsonb not null default '{}'::jsonb,status text not null default 'processing' check(status in('processing','processed','failed')),attempts integer not null default 1,last_error text,received_at timestamptz not null default now(),processed_at timestamptz,unique(provider,event_id));
create table if not exists public.audit_logs(id bigint generated always as identity primary key,actor_id uuid,action text not null,entity_type text not null,entity_id text,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
alter table webhook_events enable row level security;alter table audit_logs enable row level security;
create policy "admin consulta auditoria" on audit_logs for select using(has_system_role(array['admin']));
create or replace function public.write_audit_log()returns trigger language plpgsql security definer set search_path=public as $$begin insert into audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)values(auth.uid(),tg_op,tg_table_name,coalesce(new.id::text,old.id::text),case when tg_op in('UPDATE','DELETE')then to_jsonb(old)end,case when tg_op in('INSERT','UPDATE')then to_jsonb(new)end);return coalesce(new,old);end;$$;
drop trigger if exists audit_products on products;create trigger audit_products after insert or update or delete on products for each row execute function write_audit_log();
drop trigger if exists audit_orders on orders;create trigger audit_orders after update or delete on orders for each row execute function write_audit_log();
drop trigger if exists audit_store_settings on store_settings;create trigger audit_store_settings after update on store_settings for each row execute function write_audit_log();
drop trigger if exists audit_financial_entries on financial_entries;create trigger audit_financial_entries after insert or update or delete on financial_entries for each row execute function write_audit_log();
drop trigger if exists audit_employee_details on employee_details;create trigger audit_employee_details after insert or update or delete on employee_details for each row execute function write_audit_log();
revoke all on table webhook_events from anon,authenticated;revoke insert,update,delete on audit_logs from anon,authenticated;
-- Privilégio explícito para RPCs expostas ao aplicativo.
revoke all on function public.create_order(jsonb) from public,anon;grant execute on function public.create_order(jsonb) to authenticated;
revoke all on function public.create_pos_order(jsonb) from public,anon;grant execute on function public.create_pos_order(jsonb) to authenticated;
revoke all on function public.open_cash_session(numeric) from public,anon;grant execute on function public.open_cash_session(numeric) to authenticated;
revoke all on function public.add_cash_movement(text,numeric,text) from public,anon;grant execute on function public.add_cash_movement(text,numeric,text) to authenticated;
revoke all on function public.close_cash_session(numeric,text) from public,anon;grant execute on function public.close_cash_session(numeric,text) to authenticated;
revoke all on function public.update_my_details(text,text,text) from public,anon;grant execute on function public.update_my_details(text,text,text) to authenticated;
revoke all on function public.update_my_avatar(text) from public,anon;grant execute on function public.update_my_avatar(text) to authenticated;
revoke all on function public.save_customer_address(jsonb) from public,anon;grant execute on function public.save_customer_address(jsonb) to authenticated;
revoke all on function public.validate_coupon(text,numeric) from public,anon;grant execute on function public.validate_coupon(text,numeric) to authenticated;
revoke all on function public.toggle_time_clock(text) from public,anon;grant execute on function public.toggle_time_clock(text) to authenticated;
-- Arquivos ficam no Storage; o banco guarda apenas URLs pequenas e evita Base64 nas linhas.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('products','products',true,2097152,array['image/jpeg','image/png','image/webp']),
  ('branding','branding',true,2097152,array['image/jpeg','image/png','image/webp']),
  ('avatars','avatars',true,1048576,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "leitura publica de midias" on storage.objects;
create policy "leitura publica de midias" on storage.objects for select using(bucket_id in('products','branding','avatars'));
drop policy if exists "equipe envia catalogo e marca" on storage.objects;
create policy "equipe envia catalogo e marca" on storage.objects for insert to authenticated with check(bucket_id in('products','branding') and public.has_system_role(array['admin','manager','inventory']));
drop policy if exists "equipe gerencia catalogo e marca" on storage.objects;
create policy "equipe gerencia catalogo e marca" on storage.objects for delete to authenticated using(bucket_id in('products','branding') and public.has_system_role(array['admin','manager','inventory']));
drop policy if exists "usuario envia proprio avatar" on storage.objects;
create policy "usuario envia proprio avatar" on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "usuario remove proprio avatar" on storage.objects;
create policy "usuario remove proprio avatar" on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
-- Fotos de doações podem conter dados pessoais e não devem possuir URL pública.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('donations','donations',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "cliente envia fotos de doacao" on storage.objects;
create policy "cliente envia fotos de doacao" on storage.objects for insert to authenticated with check(bucket_id='donations' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "cliente ve fotos de doacao" on storage.objects;
create policy "cliente ve fotos de doacao" on storage.objects for select to authenticated using(bucket_id='donations' and ((storage.foldername(name))[1]=auth.uid()::text or public.has_system_role(array['admin','manager'])));
drop policy if exists "cliente remove fotos de doacao" on storage.objects;
create policy "cliente remove fotos de doacao" on storage.objects for delete to authenticated using(bucket_id='donations' and ((storage.foldername(name))[1]=auth.uid()::text or public.has_system_role(array['admin','manager'])));
-- Reservas abandonadas não podem bloquear peças únicas indefinidamente.
alter table public.orders add column if not exists pending_expires_at timestamptz default(now()+interval '24 hours');
update public.orders set pending_expires_at=created_at+interval '24 hours' where status='pendente' and pending_expires_at is null;
create index if not exists orders_pending_expiration_idx on public.orders(pending_expires_at) where status='pendente';

create or replace function public.reconcile_order_payment(p_order_id uuid,p_status text,p_reference text default null)returns order_status language plpgsql security definer set search_path=public as $$declare current_order orders%rowtype;next_status order_status;item record;begin select*into current_order from orders where id=p_order_id for update;if current_order.id is null then raise exception 'Pedido não encontrado';end if;if current_order.status='cancelado'and p_status='pago'then raise exception 'Pedido cancelado exige conciliação manual para evitar divergência de estoque';end if;next_status:=case when p_status='pago'then'pago'::order_status when p_status='cancelado'then'cancelado'::order_status else current_order.status end;if current_order.status in('pago','separando','enviado','concluido')then next_status:=current_order.status;end if;if current_order.status='pendente'and next_status='cancelado'then for item in select product_id,quantity from order_items where order_id=p_order_id and product_id is not null loop update products set stock=stock+item.quantity,updated_at=now()where id=item.product_id;end loop;if current_order.coupon_code is not null then update coupons set used_count=greatest(0,used_count-1)where code=current_order.coupon_code;end if;end if;update orders set status=next_status,payment_reference=coalesce(nullif(p_reference,''),payment_reference),payment_checked_at=now(),paid_at=case when next_status='pago'then coalesce(paid_at,now())else paid_at end,cancelled_at=case when next_status='cancelado'then coalesce(cancelled_at,now())else cancelled_at end where id=p_order_id;return next_status;end;$$;
revoke all on function public.reconcile_order_payment(uuid,text,text)from public,anon,authenticated;grant execute on function public.reconcile_order_payment(uuid,text,text)to service_role;

create or replace function public.expire_pending_orders(p_limit integer default 200)returns integer language plpgsql security definer set search_path=public as $$declare candidate record;expired_count integer:=0;begin for candidate in select id from orders where status='pendente'and pending_expires_at<=now()order by pending_expires_at for update skip locked limit greatest(1,least(coalesce(p_limit,200),1000))loop perform reconcile_order_payment(candidate.id,'cancelado','expired_by_system');expired_count:=expired_count+1;end loop;return expired_count;end;$$;
revoke all on function public.expire_pending_orders(integer)from public,anon,authenticated;grant execute on function public.expire_pending_orders(integer)to service_role;
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
-- Central de notificações transacionais da conta do cliente.
create table if not exists public.customer_notifications(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  type text not null default 'order',
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists customer_notifications_feed_idx on public.customer_notifications(customer_id,created_at desc);
alter table public.customer_notifications enable row level security;
drop policy if exists "cliente consulta notificacoes" on public.customer_notifications;
create policy "cliente consulta notificacoes" on public.customer_notifications for select to authenticated using(customer_id=auth.uid());
grant select on public.customer_notifications to authenticated;

create or replace function public.notify_order_status()returns trigger language plpgsql security definer set search_path=public as $$declare notification_title text;notification_message text;begin if new.status=old.status then return new;end if;notification_title:=case new.status when'pago'then'Pagamento confirmado'when'separando'then'Pedido em separação'when'enviado'then'Pedido enviado'when'concluido'then'Pedido entregue'when'cancelado'then'Pedido cancelado'else'Pedido atualizado'end;notification_message:=case new.status when'pago'then'Recebemos seu pagamento e a compra foi confirmada.'when'separando'then'Suas peças estão sendo preparadas para envio.'when'enviado'then'Seu pedido saiu para a transportadora. Consulte o rastreio.'when'concluido'then'Entrega concluída. Obrigado por escolher moda circular!'when'cancelado'then'O pedido foi cancelado. Consulte os detalhes na sua conta.'else'O status do pedido foi atualizado.'end;insert into customer_notifications(customer_id,order_id,type,title,message)values(new.customer_id,new.id,'order',notification_title,notification_message);return new;end;$$;
drop trigger if exists notify_order_status_change on public.orders;
create trigger notify_order_status_change after update of status on public.orders for each row execute function public.notify_order_status();

create or replace function public.notify_tracking_event()returns trigger language plpgsql security definer set search_path=public as $$declare owner_id uuid;begin select customer_id into owner_id from orders where id=new.order_id;if owner_id is not null then insert into customer_notifications(customer_id,order_id,type,title,message)values(owner_id,new.order_id,'tracking','Nova atualização de entrega',coalesce(new.description,'O transporte do seu pedido foi atualizado.'));end if;return new;end;$$;
drop trigger if exists notify_new_tracking_event on public.tracking_events;
create trigger notify_new_tracking_event after insert on public.tracking_events for each row execute function public.notify_tracking_event();

create or replace function public.mark_my_notifications_read(p_id uuid default null)returns integer language plpgsql security definer set search_path=public as $$declare changed integer;begin update customer_notifications set read_at=now()where customer_id=auth.uid()and read_at is null and(p_id is null or id=p_id);get diagnostics changed=row_count;return changed;end;$$;
revoke all on function public.mark_my_notifications_read(uuid)from public,anon;grant execute on function public.mark_my_notifications_read(uuid)to authenticated;
-- Rate limit atômico e persistente para funções serverless distribuídas.
create table if not exists public.api_rate_limits(
  key_hash text primary key,
  hits integer not null default 0,
  reset_at timestamptz not null
);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public,anon,authenticated;

create or replace function public.consume_api_rate_limit(p_key text,p_limit integer,p_window_seconds integer)returns jsonb language plpgsql security definer set search_path=public as $$declare current_row api_rate_limits%rowtype;safe_limit integer:=greatest(1,least(coalesce(p_limit,20),1000));safe_window integer:=greatest(1,least(coalesce(p_window_seconds,60),86400));begin if random()<0.02 then delete from api_rate_limits where reset_at<now()-interval'1 day';end if;insert into api_rate_limits(key_hash,hits,reset_at)values(p_key,1,now()+make_interval(secs=>safe_window))on conflict(key_hash)do update set hits=case when api_rate_limits.reset_at<=now()then 1 else api_rate_limits.hits+1 end,reset_at=case when api_rate_limits.reset_at<=now()then now()+make_interval(secs=>safe_window)else api_rate_limits.reset_at end returning*into current_row;return jsonb_build_object('allowed',current_row.hits<=safe_limit,'hits',current_row.hits,'retry_after',greatest(1,ceil(extract(epoch from(current_row.reset_at-now())))::integer));end;$$;
revoke all on function public.consume_api_rate_limit(text,integer,integer)from public,anon,authenticated;grant execute on function public.consume_api_rate_limit(text,integer,integer)to service_role;
-- Despacho transacional: impede envio de pedido sem pagamento e grava o histórico junto.
create or replace function public.dispatch_order(p_order_id uuid,p_carrier text,p_service text,p_tracking_code text,p_tracking_url text default null,p_description text default null,p_location text default null)returns jsonb language plpgsql security definer set search_path=public as $$declare target orders%rowtype;begin if not has_system_role(array['admin','manager'])then raise exception 'Conta sem permissão para despachar pedidos';end if;if nullif(trim(p_carrier),'')is null or nullif(trim(p_tracking_code),'')is null then raise exception 'Transportadora e código de rastreio são obrigatórios';end if;select*into target from orders where id=p_order_id for update;if target.id is null then raise exception 'Pedido não encontrado';end if;if target.status not in('pago','separando','enviado')then raise exception 'Somente pedidos pagos podem ser despachados';end if;update orders set carrier=trim(p_carrier),shipping_service=coalesce(nullif(trim(p_service),''),trim(p_carrier)),tracking_code=trim(p_tracking_code),tracking_url=nullif(trim(p_tracking_url),''),status='enviado'where id=p_order_id;insert into tracking_events(order_id,status,description,location)values(p_order_id,'enviado',coalesce(nullif(trim(p_description),''),'Pedido postado e encaminhado à transportadora'),nullif(trim(p_location),''));return jsonb_build_object('id',p_order_id,'status','enviado','tracking_code',trim(p_tracking_code));end;$$;
revoke all on function public.dispatch_order(uuid,text,text,text,text,text,text)from public,anon;grant execute on function public.dispatch_order(uuid,text,text,text,text,text,text)to authenticated;
-- Protege o caixa contra sessões concorrentes, retiradas sem saldo e vendas duplicadas no carrinho.
create unique index if not exists cash_sessions_one_open_per_operator
  on public.cash_sessions(operator_id) where status = 'open';

create or replace function public.open_cash_session(p_opening_balance numeric) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not has_system_role(array['admin','manager','cashier']) then raise exception 'Acesso negado'; end if;
  if p_opening_balance is null or p_opening_balance < 0 then raise exception 'O saldo inicial não pode ser negativo'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if exists(select 1 from cash_sessions where operator_id=auth.uid() and status='open') then
    raise exception 'Você já possui um caixa aberto';
  end if;
  insert into cash_sessions(operator_id,opening_balance) values(auth.uid(),p_opening_balance) returning id into new_id;
  return new_id;
end; $$;

create or replace function public.add_cash_movement(p_movement_type text,p_amount numeric,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare s cash_sessions%rowtype; mid uuid; available numeric;
begin
  if not has_system_role(array['admin','manager','cashier']) then raise exception 'Acesso negado'; end if;
  if p_movement_type not in ('supply','withdrawal') then raise exception 'Movimento inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo do movimento'; end if;
  select * into s from cash_sessions where operator_id=auth.uid() and status='open'
    order by opened_at desc limit 1 for update;
  if s.id is null then raise exception 'Abra o caixa primeiro'; end if;
  if p_movement_type='withdrawal' then
    select s.opening_balance + coalesce(sum(case when type in ('sale','supply') then amount else -amount end),0)
      into available from cash_movements where session_id=s.id;
    if p_amount > available then raise exception 'A retirada excede o saldo disponível no caixa'; end if;
  end if;
  insert into cash_movements(session_id,operator_id,type,amount,reason)
    values(s.id,auth.uid(),p_movement_type,p_amount,trim(p_reason)) returning id into mid;
  return mid;
end; $$;

create or replace function public.close_cash_session(p_counted_balance numeric,p_closing_notes text) returns uuid
language plpgsql security definer set search_path=public as $$
declare s cash_sessions%rowtype; expected numeric;
begin
  if not has_system_role(array['admin','manager','cashier']) then raise exception 'Acesso negado'; end if;
  if p_counted_balance is null or p_counted_balance < 0 then raise exception 'O saldo contado não pode ser negativo'; end if;
  select * into s from cash_sessions where operator_id=auth.uid() and status='open'
    order by opened_at desc limit 1 for update;
  if s.id is null then raise exception 'Nenhum caixa aberto'; end if;
  select s.opening_balance + coalesce(sum(case when type in ('sale','supply') then amount else -amount end),0)
    into expected from cash_movements where session_id=s.id;
  update cash_sessions set status='closed',closed_at=now(),expected_balance=expected,
    counted_balance=p_counted_balance,difference=p_counted_balance-expected,
    closing_notes=nullif(trim(coalesce(p_closing_notes,'')),'') where id=s.id;
  return s.id;
end; $$;

create or replace function public.create_pos_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  new_id uuid; requested record; product_record products%rowtype; sid uuid;
  subtotal numeric:=0; discount numeric:=0; method text;
begin
  if not has_system_role(array['admin','manager','cashier']) then raise exception 'Acesso ao caixa não autorizado'; end if;
  select id into sid from cash_sessions where operator_id=auth.uid() and status='open'
    order by opened_at desc limit 1 for update;
  if sid is null then raise exception 'Abra o caixa antes de realizar vendas'; end if;
  if payload->'items' is null or jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then
    raise exception 'Adicione um produto';
  end if;
  method:=lower(trim(coalesce(payload->>'payment_method','dinheiro')));
  if method='cartao' then method:='cartão'; end if;
  if method not in ('dinheiro','pix','cartão') then raise exception 'Forma de pagamento inválida'; end if;
  for requested in
    select (item->>'product_id')::uuid product_id, sum((item->>'quantity')::int)::int quantity
    from jsonb_array_elements(payload->'items') item group by 1 order by 1
  loop
    if requested.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    select * into product_record from products where id=requested.product_id and active=true for update;
    if product_record.id is null or product_record.stock < requested.quantity then raise exception 'Produto sem estoque'; end if;
    subtotal:=subtotal + product_record.price*requested.quantity;
  end loop;
  discount:=greatest(0,least(coalesce((payload->>'discount')::numeric,0),subtotal));
  insert into orders(customer_id,customer_name,subtotal,discount,total,status,payment_method,payment_provider,receipt_type,customer_document)
    values(auth.uid(),coalesce(nullif(trim(payload->>'customer_name'),''),'Consumidor final'),subtotal,discount,
      subtotal-discount,'pago',method,'pdv',coalesce(payload->>'receipt_type','nao_fiscal'),nullif(trim(payload->>'customer_document'),''))
    returning id into new_id;
  for requested in
    select (item->>'product_id')::uuid product_id, sum((item->>'quantity')::int)::int quantity
    from jsonb_array_elements(payload->'items') item group by 1 order by 1
  loop
    select * into product_record from products where id=requested.product_id for update;
    insert into order_items(order_id,product_id,quantity,unit_price)
      values(new_id,product_record.id,requested.quantity,product_record.price);
    update products set stock=stock-requested.quantity,updated_at=now() where id=product_record.id;
  end loop;
  if method='dinheiro' then
    insert into cash_movements(session_id,operator_id,type,amount,reason,order_id)
      values(sid,auth.uid(),'sale',subtotal-discount,'Venda presencial',new_id);
  end if;
  return new_id;
end; $$;
-- Agrupa produtos repetidos e mantém a reserva do estoque online transacional e idempotente.
create or replace function public.create_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  new_id uuid;
  requested record;
  product_record products%rowtype;
  order_subtotal numeric:=0;
  freight numeric:=0;
  discount_value numeric:=0;
  profile_name text;
  request_key uuid;
  coupon_record coupons%rowtype;
  coupon text:=upper(trim(coalesce(payload->>'coupon_code','')));
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role='customer') then
    raise exception 'Entre com uma conta de cliente';
  end if;

  begin
    request_key:=nullif(payload->>'checkout_key','')::uuid;
  exception when invalid_text_representation then
    raise exception 'Identificador de checkout inválido';
  end;

  if request_key is not null then
    select id into new_id from orders where customer_id=auth.uid() and checkout_key=request_key;
    if new_id is not null then return new_id; end if;
  end if;

  if payload->'items' is null or jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then
    raise exception 'A sacola está vazia';
  end if;

  select name into profile_name from profiles where id=auth.uid();

  -- A ordenação dos UUIDs garante a mesma ordem de bloqueio em checkouts concorrentes.
  for requested in
    select (item->>'product_id')::uuid product_id,
           sum((item->>'quantity')::int)::int quantity
      from jsonb_array_elements(payload->'items') item
     group by 1 order by 1
  loop
    if requested.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    select * into product_record from products
      where id=requested.product_id and active=true for update;
    if product_record.id is null or product_record.stock < requested.quantity then
      raise exception 'Uma peça ficou indisponível';
    end if;
    order_subtotal:=order_subtotal + product_record.price*requested.quantity;
  end loop;

  if coupon<>'' then
    select * into coupon_record from coupons
      where code=coupon and active=true and (expires_at is null or expires_at>now())
        and used_count<usage_limit for update;
    if coupon_record.id is null then raise exception 'Cupom inválido, esgotado ou expirado'; end if;
    if order_subtotal<coupon_record.min_order_value then raise exception 'Valor mínimo do cupom não atingido'; end if;
    discount_value:=case when coupon_record.discount_type='percentage'
      then order_subtotal*coupon_record.discount_value/100 else coupon_record.discount_value end;
    discount_value:=round(least(order_subtotal,greatest(0,discount_value)),2);
  end if;

  freight:=greatest(coalesce((payload->>'shipping_cost')::numeric,0),0);
  insert into orders(customer_id,customer_name,subtotal,discount,total,status,payment_method,
    shipping_address,shipping_service,shipping_cost,checkout_key,coupon_code)
  values(auth.uid(),profile_name,order_subtotal,discount_value,order_subtotal-discount_value+freight,
    'pendente',coalesce(payload->>'payment_method','pix'),payload->'shipping_address',
    payload->>'shipping_method',freight,request_key,nullif(coupon,''))
  returning id into new_id;

  for requested in
    select (item->>'product_id')::uuid product_id,
           sum((item->>'quantity')::int)::int quantity
      from jsonb_array_elements(payload->'items') item
     group by 1 order by 1
  loop
    select * into product_record from products where id=requested.product_id for update;
    insert into order_items(order_id,product_id,quantity,unit_price)
      values(new_id,product_record.id,requested.quantity,product_record.price);
    update products set stock=stock-requested.quantity,updated_at=now()
      where id=product_record.id;
  end loop;

  if coupon_record.id is not null then
    update coupons set used_count=used_count+1 where id=coupon_record.id;
  end if;
  return new_id;
exception when unique_violation then
  if request_key is null then raise; end if;
  select id into new_id from orders where customer_id=auth.uid() and checkout_key=request_key;
  if new_id is null then raise; end if;
  return new_id;
end; $$;
-- A auditoria suporta tabelas cuja chave primária não se chama "id", como employee_details.profile_id.
create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  before_row jsonb;
  after_row jsonb;
  record_key text;
begin
  if tg_op in ('UPDATE','DELETE') then before_row:=to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then after_row:=to_jsonb(new); end if;

  record_key:=coalesce(
    after_row->>'id', before_row->>'id',
    after_row->>'profile_id', before_row->>'profile_id',
    after_row->>'provider', before_row->>'provider'
  );

  insert into audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),tg_op,tg_table_name,record_key,before_row,after_row);

  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
-- Mantém checkout_key como texto e evita a comparação inválida entre text e uuid.
create or replace function public.create_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  new_id uuid;
  requested record;
  product_record products%rowtype;
  order_subtotal numeric:=0;
  freight numeric:=0;
  discount_value numeric:=0;
  profile_name text;
  request_key text;
  coupon_record coupons%rowtype;
  coupon text:=upper(trim(coalesce(payload->>'coupon_code','')));
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role='customer') then
    raise exception 'Entre com uma conta de cliente';
  end if;

  request_key:=nullif(trim(payload->>'checkout_key'),'');
  if request_key is not null and request_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Identificador de checkout inválido';
  end if;

  if request_key is not null then
    select id into new_id from orders where customer_id=auth.uid() and checkout_key=request_key;
    if new_id is not null then return new_id; end if;
  end if;

  if payload->'items' is null or jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then
    raise exception 'A sacola está vazia';
  end if;

  select name into profile_name from profiles where id=auth.uid();

  -- A ordenação dos UUIDs garante a mesma ordem de bloqueio em checkouts concorrentes.
  for requested in
    select (item->>'product_id')::uuid product_id,
           sum((item->>'quantity')::int)::int quantity
      from jsonb_array_elements(payload->'items') item
     group by 1 order by 1
  loop
    if requested.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    select * into product_record from products
      where id=requested.product_id and active=true for update;
    if product_record.id is null or product_record.stock < requested.quantity then
      raise exception 'Uma peça ficou indisponível';
    end if;
    order_subtotal:=order_subtotal + product_record.price*requested.quantity;
  end loop;

  if coupon<>'' then
    select * into coupon_record from coupons
      where code=coupon and active=true and (expires_at is null or expires_at>now())
        and used_count<usage_limit for update;
    if coupon_record.id is null then raise exception 'Cupom inválido, esgotado ou expirado'; end if;
    if order_subtotal<coupon_record.min_order_value then raise exception 'Valor mínimo do cupom não atingido'; end if;
    discount_value:=case when coupon_record.discount_type='percentage'
      then order_subtotal*coupon_record.discount_value/100 else coupon_record.discount_value end;
    discount_value:=round(least(order_subtotal,greatest(0,discount_value)),2);
  end if;

  freight:=greatest(coalesce((payload->>'shipping_cost')::numeric,0),0);
  insert into orders(customer_id,customer_name,subtotal,discount,total,status,payment_method,
    shipping_address,shipping_service,shipping_cost,checkout_key,coupon_code)
  values(auth.uid(),profile_name,order_subtotal,discount_value,order_subtotal-discount_value+freight,
    'pendente',coalesce(payload->>'payment_method','pix'),payload->'shipping_address',
    payload->>'shipping_method',freight,request_key,nullif(coupon,''))
  returning id into new_id;

  for requested in
    select (item->>'product_id')::uuid product_id,
           sum((item->>'quantity')::int)::int quantity
      from jsonb_array_elements(payload->'items') item
     group by 1 order by 1
  loop
    select * into product_record from products where id=requested.product_id for update;
    insert into order_items(order_id,product_id,quantity,unit_price)
      values(new_id,product_record.id,requested.quantity,product_record.price);
    update products set stock=stock-requested.quantity,updated_at=now()
      where id=product_record.id;
  end loop;

  if coupon_record.id is not null then
    update coupons set used_count=used_count+1 where id=coupon_record.id;
  end if;
  return new_id;
exception when unique_violation then
  if request_key is null then raise; end if;
  select id into new_id from orders where customer_id=auth.uid() and checkout_key=request_key;
  if new_id is null then raise; end if;
  return new_id;
end; $$;

-- Calcula frete e valida meios de entrega/pagamento exclusivamente no banco.
alter table public.store_settings add column if not exists standard_shipping_cost numeric(10,2) not null default 19.90;
alter table public.store_settings add column if not exists express_shipping_cost numeric(10,2) not null default 34.90;

alter table public.store_settings drop constraint if exists store_settings_shipping_costs_nonnegative;
alter table public.store_settings add constraint store_settings_shipping_costs_nonnegative
  check(standard_shipping_cost>=0 and express_shipping_cost>=0);
create or replace function public.create_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  new_id uuid;
  requested record;
  product_record products%rowtype;
  order_subtotal numeric:=0;
  freight numeric:=0;
  discount_value numeric:=0;
  profile_name text;
  request_key text;
  coupon_record coupons%rowtype;
  store_config store_settings%rowtype;
  shipping_method text:=trim(coalesce(payload->>'shipping_method',''));
  payment_method text:=trim(coalesce(payload->>'payment_method',''));
  coupon text:=upper(trim(coalesce(payload->>'coupon_code','')));
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role='customer') then
    raise exception 'Entre com uma conta de cliente';
  end if;

  request_key:=nullif(trim(payload->>'checkout_key'),'');
  if request_key is not null and request_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Identificador de checkout inválido';
  end if;

  if request_key is not null then
    select id into new_id from orders where customer_id=auth.uid() and checkout_key=request_key;
    if new_id is not null then return new_id; end if;
  end if;

  if payload->'items' is null or jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then
    raise exception 'A sacola está vazia';
  end if;

  select name into profile_name from profiles where id=auth.uid();
  select * into store_config from store_settings where id=1;
  if store_config.id is null then raise exception 'Configuração da loja indisponível'; end if;
  if store_config.maintenance_mode then raise exception 'A loja está temporariamente em manutenção'; end if;
  if payment_method not in ('pix','cartao') then raise exception 'Forma de pagamento inválida'; end if;
  if payment_method='pix' and (not coalesce(store_config.pix_enabled,true) or not (coalesce(store_config.mercadopago_enabled,false) or coalesce(store_config.pagbank_enabled,false))) then raise exception 'Pix indisponível'; end if;
  if payment_method='cartao' and (not coalesce(store_config.card_enabled,true) or not (coalesce(store_config.stripe_enabled,false) or coalesce(store_config.mercadopago_enabled,false))) then raise exception 'Cartão indisponível'; end if;
  if shipping_method not in ('Correios PAC','Entrega expressa','Retirada na loja') then raise exception 'Forma de entrega inválida'; end if;
  if shipping_method='Retirada na loja' and not coalesce(store_config.pickup_enabled,false) then raise exception 'Retirada na loja indisponível'; end if;
  if shipping_method<>'Retirada na loja' and (
    nullif(trim(payload->'shipping_address'->>'zip_code'),'') is null or
    nullif(trim(payload->'shipping_address'->>'street'),'') is null or
    nullif(trim(payload->'shipping_address'->>'number'),'') is null or
    nullif(trim(payload->'shipping_address'->>'city'),'') is null or
    nullif(trim(payload->'shipping_address'->>'state'),'') is null
  ) then raise exception 'Endereço de entrega incompleto'; end if;

  -- A ordenação dos UUIDs garante a mesma ordem de bloqueio em checkouts concorrentes.
  for requested in
    select (item->>'product_id')::uuid product_id,
           sum((item->>'quantity')::int)::int quantity
      from jsonb_array_elements(payload->'items') item
     group by 1 order by 1
  loop
    if requested.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    select * into product_record from products
      where id=requested.product_id and active=true for update;
    if product_record.id is null or product_record.stock < requested.quantity then
      raise exception 'Uma peça ficou indisponível';
    end if;
    order_subtotal:=order_subtotal + product_record.price*requested.quantity;
  end loop;

  if coupon<>'' then
    select * into coupon_record from coupons
      where code=coupon and active=true and (expires_at is null or expires_at>now())
        and used_count<usage_limit for update;
    if coupon_record.id is null then raise exception 'Cupom inválido, esgotado ou expirado'; end if;
    if order_subtotal<coupon_record.min_order_value then raise exception 'Valor mínimo do cupom não atingido'; end if;
    discount_value:=case when coupon_record.discount_type='percentage'
      then order_subtotal*coupon_record.discount_value/100 else coupon_record.discount_value end;
    discount_value:=round(least(order_subtotal,greatest(0,discount_value)),2);
  end if;

  freight:=case
    when shipping_method='Retirada na loja' then 0
    when coalesce(store_config.free_shipping_threshold,0)>0 and order_subtotal>=store_config.free_shipping_threshold then 0
    when shipping_method='Entrega expressa' then store_config.express_shipping_cost
    else store_config.standard_shipping_cost
  end;
  insert into orders(customer_id,customer_name,subtotal,discount,total,status,payment_method,
    shipping_address,shipping_service,shipping_cost,checkout_key,coupon_code)
  values(auth.uid(),profile_name,order_subtotal,discount_value,order_subtotal-discount_value+freight,
    'pendente',payment_method,payload->'shipping_address',
    shipping_method,freight,request_key,nullif(coupon,''))
  returning id into new_id;

  for requested in
    select (item->>'product_id')::uuid product_id,
           sum((item->>'quantity')::int)::int quantity
      from jsonb_array_elements(payload->'items') item
     group by 1 order by 1
  loop
    select * into product_record from products where id=requested.product_id for update;
    insert into order_items(order_id,product_id,quantity,unit_price)
      values(new_id,product_record.id,requested.quantity,product_record.price);
    update products set stock=stock-requested.quantity,updated_at=now()
      where id=product_record.id;
  end loop;

  if coupon_record.id is not null then
    update coupons set used_count=used_count+1 where id=coupon_record.id;
  end if;
  return new_id;
exception when unique_violation then
  if request_key is null then raise; end if;
  select id into new_id from orders where customer_id=auth.uid() and checkout_key=request_key;
  if new_id is null then raise; end if;
  return new_id;
end; $$;
-- Processamento atômico de webhooks com retomada de workers interrompidos.
alter table public.webhook_events add column if not exists locked_at timestamptz not null default now();
alter table public.webhook_events add column if not exists claim_token uuid;

create or replace function public.claim_webhook_event(p_provider text,p_event_id text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare token uuid:=gen_random_uuid();claimed uuid;
begin
  if nullif(trim(p_provider),'') is null or nullif(trim(p_event_id),'') is null then return null; end if;
  insert into webhook_events(provider,event_id,payload,status,attempts,last_error,locked_at,claim_token)
  values(trim(p_provider),trim(p_event_id),coalesce(p_payload,'{}'::jsonb),'processing',1,null,now(),token)
  on conflict(provider,event_id) do update set
    payload=excluded.payload,status='processing',attempts=webhook_events.attempts+1,last_error=null,locked_at=now(),claim_token=token
  where webhook_events.status='failed'
     or (webhook_events.status='processing' and webhook_events.locked_at<now()-interval '5 minutes')
  returning webhook_events.claim_token into claimed;
  return claimed;
end;$$;

create or replace function public.finish_webhook_event(p_provider text,p_event_id text,p_claim_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  update webhook_events set status=case when p_success then 'processed' else 'failed' end,
    processed_at=case when p_success then now() else null end,
    last_error=case when p_success then null else left(coalesce(p_error,'Erro desconhecido'),1000) end
  where provider=p_provider and event_id=p_event_id and status='processing' and claim_token=p_claim_token;
  get diagnostics changed=row_count;
  return changed=1;
end;$$;

revoke all on function public.claim_webhook_event(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_webhook_event(text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_webhook_event(text,text,jsonb) to service_role;
grant execute on function public.finish_webhook_event(text,text,uuid,boolean,text) to service_role;


-- AUDIT-HARDENING-2026-10: manter instalações novas alinhadas à migration 028.
-- Endurecimento do Data API após auditoria do banco real em 2026-10.
-- Mantém RPCs de negócio autenticadas e fecha superfícies que não devem ser chamadas diretamente.

-- O cofre é exclusivamente server-side. RLS sem policy já bloqueava linhas, mas removemos
-- também os grants de Data API para reduzir a superfície de ataque.
revoke all on table public.integration_secrets from public,anon,authenticated;
grant select,insert,update,delete on table public.integration_secrets to service_role;

-- Códigos de cupom não devem ser enumeráveis por visitantes.
-- Clientes validam um código conhecido pela RPC validate_coupon; a tela de gestão continua
-- usando acesso autenticado protegido por is_admin().
drop policy if exists "cupons publicos ativos" on public.coupons;
drop policy if exists "admin consulta cupons" on public.coupons;
create policy "admin consulta cupons" on public.coupons
  for select to authenticated
  using (is_admin());

revoke all on table public.coupons from anon;
grant select,insert,update,delete on table public.coupons to authenticated;
grant select,insert,update,delete on table public.coupons to service_role;

-- Funções internas de trigger/event-trigger não são endpoints RPC.
-- Os triggers continuam executando pelo mecanismo do Postgres; usuários da API não precisam
-- de EXECUTE direto nelas.
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.notify_order_status() from public,anon,authenticated;
revoke execute on function public.notify_tracking_event() from public,anon,authenticated;
revoke execute on function public.write_audit_log() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;

-- AUDIT-PERFORMANCE-2026-10
-- Otimização do banco real após auditoria do Supabase em 2026-10.
-- Não altera regras de acesso: adiciona índices de FKs e evita reavaliar auth.uid() por linha.

create index if not exists cash_movements_operator_id_idx on public.cash_movements(operator_id);
create index if not exists cash_movements_order_id_idx on public.cash_movements(order_id);
create index if not exists cash_movements_session_id_idx on public.cash_movements(session_id);
create index if not exists coupons_created_by_idx on public.coupons(created_by);
create index if not exists customer_favorites_product_id_idx on public.customer_favorites(product_id);
create index if not exists customer_notifications_order_id_idx on public.customer_notifications(order_id);
create index if not exists donations_donor_id_idx on public.donations(donor_id);
create index if not exists financial_entries_created_by_idx on public.financial_entries(created_by);
create index if not exists integration_secrets_updated_by_idx on public.integration_secrets(updated_by);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists time_entries_employee_id_idx on public.time_entries(employee_id);
create index if not exists tracking_events_created_by_idx on public.tracking_events(created_by);
create index if not exists tracking_events_order_id_idx on public.tracking_events(order_id);

alter policy "equipe ve movimentos" on public.cash_movements using ((operator_id = (select auth.uid())) or has_system_role(array['admin','manager']));
alter policy "equipe ve caixas" on public.cash_sessions using ((operator_id = (select auth.uid())) or has_system_role(array['admin','manager']));
alter policy "cliente cria enderecos" on public.customer_addresses with check ((customer_id = (select auth.uid())) and exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'customer'::user_role));
alter policy "cliente exclui enderecos" on public.customer_addresses using (customer_id = (select auth.uid()));
alter policy "cliente ve enderecos" on public.customer_addresses using (customer_id = (select auth.uid()));
alter policy "cliente gerencia favoritos" on public.customer_favorites using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
alter policy "cliente consulta notificacoes" on public.customer_notifications using (customer_id = (select auth.uid()));
alter policy "cliente acompanha doacao" on public.donations using ((donor_id = (select auth.uid())) or is_admin());
alter policy "cliente cria doacao" on public.donations with check (donor_id = (select auth.uid()));
alter policy "gestao ve rh" on public.employee_details using ((profile_id = (select auth.uid())) or has_system_role(array['admin','manager']));
alter policy "cliente ve itens" on public.order_items using (exists (select 1 from public.orders where orders.id = order_items.order_id and ((orders.customer_id = (select auth.uid())) or is_admin())));
alter policy "cliente ve pedidos" on public.orders using ((customer_id = (select auth.uid())) or is_admin());
alter policy "perfil proprio" on public.profiles using ((id = (select auth.uid())) or is_admin());
alter policy "equipe ve ponto" on public.time_entries using ((employee_id = (select auth.uid())) or has_system_role(array['admin','manager']));
alter policy "cliente ve rastreio" on public.tracking_events using (exists (select 1 from public.orders where orders.id = tracking_events.order_id and ((orders.customer_id = (select auth.uid())) or has_system_role(array['admin','manager']))));

-- AUDIT-INTAKE-CONSIGNMENT-2026-10
-- Fluxo operacional de entrada, avaliação e consignação de peças.
-- Dados comerciais sensíveis permanecem nas tabelas de entrada; products recebe apenas campos seguros para catálogo.

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

-- Somente atributos seguros para o catálogo público ficam em products.
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists color text;
alter table public.products add column if not exists condition_grade text;

create unique index if not exists products_sku_unique_idx on public.products(sku) where sku is not null;
create unique index if not exists products_barcode_unique_idx on public.products(barcode) where barcode is not null;
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
  new_product_id uuid;
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
  if jsonb_typeof(item.images)='array' and jsonb_array_length(item.images)>0 then first_image:=nullif(item.images->>0,''); end if;

  insert into public.products(name,description,category,size,price,stock,image_url,active,sku,brand,color,condition_grade)
  values(item.name,item.description,item.category,item.size,item.sale_price,1,first_image,true,generated_sku,item.brand,item.color,item.condition_grade)
  returning id into new_product_id;

  update public.inventory_intake_items set product_id=new_product_id,status='listed',updated_at=now() where id=item.id;

  if not exists(select 1 from public.inventory_intake_items where intake_id=intake.id and status='pending') then
    update public.inventory_intakes set status='approved',updated_at=now() where id=intake.id;
  end if;

  return new_product_id;
end;
$$;

revoke all on function public.approve_intake_item(uuid) from public,anon;
grant execute on function public.approve_intake_item(uuid) to authenticated,service_role;

-- Online: os itens já existem quando o status muda para pago.
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
    intake.consignor_id,i.id,p.id,new.id,oi.id,
    round(oi.unit_price*oi.quantity,2),
    i.store_commission_percent,
    round((oi.unit_price*oi.quantity)*(i.store_commission_percent/100),2),
    round((oi.unit_price*oi.quantity)*(1-(i.store_commission_percent/100)),2),
    now()+make_interval(days=>coalesce(c.payout_days,7))
  from public.order_items oi
  join public.products p on p.id=oi.product_id
  join public.inventory_intake_items i on i.product_id=p.id
  join public.inventory_intakes intake on intake.id=i.intake_id and intake.source_type='consignment'
  join public.consignors c on c.id=intake.consignor_id
  where oi.order_id=new.id
  on conflict(order_item_id) do nothing;

  update public.inventory_intake_items i set status='sold',updated_at=now()
   where i.product_id in(select oi.product_id from public.order_items oi where oi.order_id=new.id)
     and exists(select 1 from public.inventory_intakes intake where intake.id=i.intake_id and intake.source_type='consignment');

  return new;
end;
$$;

drop trigger if exists create_consignment_settlement_on_order on public.orders;
create trigger create_consignment_settlement_on_order
after insert or update of status on public.orders
for each row execute function public.create_consignment_settlements();

revoke execute on function public.create_consignment_settlements() from public,anon,authenticated;

-- PDV: o pedido nasce pago antes dos order_items; por isso cada item inserido precisa reconciliar o repasse.
create or replace function public.create_consignment_settlement_for_order_item()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  target_order public.orders%rowtype;
begin
  select * into target_order from public.orders where id=new.order_id;
  if target_order.id is null or target_order.status<>'pago' then return new; end if;

  insert into public.consignment_settlements(
    consignor_id,intake_item_id,product_id,order_id,order_item_id,
    gross_amount,commission_percent,store_commission_amount,payout_amount,available_at
  )
  select
    intake.consignor_id,i.id,p.id,new.order_id,new.id,
    round(new.unit_price*new.quantity,2),
    i.store_commission_percent,
    round((new.unit_price*new.quantity)*(i.store_commission_percent/100),2),
    round((new.unit_price*new.quantity)*(1-(i.store_commission_percent/100)),2),
    now()+make_interval(days=>coalesce(c.payout_days,7))
  from public.products p
  join public.inventory_intake_items i on i.product_id=p.id
  join public.inventory_intakes intake on intake.id=i.intake_id and intake.source_type='consignment'
  join public.consignors c on c.id=intake.consignor_id
  where p.id=new.product_id
  on conflict(order_item_id) do nothing;

  update public.inventory_intake_items i set status='sold',updated_at=now()
   where i.product_id=new.product_id
     and exists(select 1 from public.inventory_intakes intake where intake.id=i.intake_id and intake.source_type='consignment');

  return new;
end;
$$;

drop trigger if exists create_consignment_settlement_on_order_item on public.order_items;
create trigger create_consignment_settlement_on_order_item
after insert on public.order_items
for each row execute function public.create_consignment_settlement_for_order_item();

revoke execute on function public.create_consignment_settlement_for_order_item() from public,anon,authenticated;

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
  if not has_system_role(array['admin','manager']) then raise exception 'Conta sem permissão para registrar repasses'; end if;

  select * into settlement from public.consignment_settlements where id=p_settlement_id for update;
  if settlement.id is null then raise exception 'Repasse não encontrado'; end if;
  if settlement.status='paid' then return settlement.financial_entry_id; end if;
  if settlement.status<>'pending' then raise exception 'Repasse não pode ser pago neste status'; end if;
  if settlement.available_at>now() then raise exception 'Repasse ainda não está liberado'; end if;

  select name into owner_name from public.consignors where id=settlement.consignor_id;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values('expense','Repasse de consignação','Repasse para '||coalesce(owner_name,'consignante'),settlement.payout_amount,current_date,now(),'paid')
  returning id into entry_id;

  update public.consignment_settlements
     set status='paid',paid_at=now(),payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),
         financial_entry_id=entry_id
   where id=settlement.id;

  return entry_id;
end;
$$;

revoke all on function public.pay_consignment_settlement(uuid,text) from public,anon;
grant execute on function public.pay_consignment_settlement(uuid,text) to authenticated,service_role;

-- AUDIT-RETURNS-EXCHANGE-2026-10
-- Pós-venda operacional: trocas/devoluções com retorno de estoque e confirmação manual de reembolso.
-- Não executa estorno no gateway. O status de reembolso só é concluído quando a equipe confirma o pagamento externo.

create table if not exists public.order_returns(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  customer_id uuid not null references public.profiles(id),
  resolution text not null check(resolution in('refund','exchange')),
  reason text not null,
  status text not null default 'requested' check(status in('requested','approved','received','completed','rejected')),
  refund_amount numeric(10,2) not null default 0 check(refund_amount>=0),
  refund_status text not null default 'pending' check(refund_status in('not_required','pending','completed','failed')),
  refund_reference text,
  notes text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id)
);

create table if not exists public.order_return_items(
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.order_returns(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id),
  product_id uuid references public.products(id),
  quantity integer not null check(quantity>0),
  unit_price numeric(10,2) not null check(unit_price>=0),
  restocked boolean not null default false,
  status text not null default 'pending' check(status in('pending','received','rejected')),
  created_at timestamptz not null default now(),
  unique(return_id,order_item_id)
);

create index if not exists order_returns_order_id_idx on public.order_returns(order_id);
create index if not exists order_returns_customer_id_idx on public.order_returns(customer_id);
create index if not exists order_returns_created_by_idx on public.order_returns(created_by);
create index if not exists order_returns_status_idx on public.order_returns(status,requested_at desc);
create index if not exists order_return_items_return_id_idx on public.order_return_items(return_id);
create index if not exists order_return_items_order_item_id_idx on public.order_return_items(order_item_id);
create index if not exists order_return_items_product_id_idx on public.order_return_items(product_id);

alter table public.order_returns enable row level security;
alter table public.order_return_items enable row level security;

drop policy if exists "gestao gerencia devolucoes" on public.order_returns;
create policy "gestao gerencia devolucoes" on public.order_returns
  for all to authenticated
  using (has_system_role(array['admin','manager']))
  with check (has_system_role(array['admin','manager']));

drop policy if exists "gestao gerencia itens devolucao" on public.order_return_items;
create policy "gestao gerencia itens devolucao" on public.order_return_items
  for all to authenticated
  using (has_system_role(array['admin','manager']))
  with check (has_system_role(array['admin','manager']));

revoke all on table public.order_returns,public.order_return_items from anon;
grant select,insert,update on table public.order_returns,public.order_return_items to authenticated;
grant select,insert,update,delete on table public.order_returns,public.order_return_items to service_role;

create or replace function public.create_order_return(
  p_order_id uuid,
  p_items jsonb,
  p_reason text,
  p_resolution text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target_order public.orders%rowtype;
  requested record;
  source_item public.order_items%rowtype;
  new_return_id uuid;
  total_refund numeric:=0;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para abrir devoluções';
  end if;
  if p_resolution not in('refund','exchange') then raise exception 'Solução de pós-venda inválida'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo da devolução'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Selecione ao menos um item';
  end if;

  select * into target_order from public.orders where id=p_order_id for update;
  if target_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if target_order.status not in('pago','separando','enviado','concluido') then
    raise exception 'Este pedido ainda não pode entrar em pós-venda';
  end if;

  for requested in
    select (value->>'order_item_id')::uuid as order_item_id,
           greatest(1,coalesce((value->>'quantity')::integer,1)) as quantity
    from jsonb_array_elements(p_items)
  loop
    select * into source_item from public.order_items
      where id=requested.order_item_id and order_id=target_order.id;
    if source_item.id is null then raise exception 'Item não pertence ao pedido'; end if;
    if requested.quantity>source_item.quantity then raise exception 'Quantidade devolvida excede a quantidade vendida'; end if;
    if exists(
      select 1 from public.order_return_items ri
      join public.order_returns r on r.id=ri.return_id
      where ri.order_item_id=source_item.id and r.status not in('rejected')
    ) then
      raise exception 'Este item já possui uma devolução ativa';
    end if;
    total_refund:=total_refund+(source_item.unit_price*requested.quantity);
  end loop;

  insert into public.order_returns(order_id,customer_id,resolution,reason,status,refund_amount,refund_status,approved_at)
  values(
    target_order.id,target_order.customer_id,p_resolution,trim(p_reason),'approved',
    round(total_refund,2),case when p_resolution='refund' then 'pending' else 'not_required' end,now()
  ) returning id into new_return_id;

  for requested in
    select (value->>'order_item_id')::uuid as order_item_id,
           greatest(1,coalesce((value->>'quantity')::integer,1)) as quantity
    from jsonb_array_elements(p_items)
  loop
    select * into source_item from public.order_items where id=requested.order_item_id;
    insert into public.order_return_items(return_id,order_item_id,product_id,quantity,unit_price)
    values(new_return_id,source_item.id,source_item.product_id,requested.quantity,source_item.unit_price);
  end loop;

  return new_return_id;
end;
$$;

revoke all on function public.create_order_return(uuid,jsonb,text,text) from public,anon;
grant execute on function public.create_order_return(uuid,jsonb,text,text) to authenticated,service_role;

create or replace function public.receive_order_return(p_return_id uuid,p_restock boolean default true)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.order_returns%rowtype;
  item record;
begin
  if not has_system_role(array['admin','manager','inventory']) then
    raise exception 'Conta sem permissão para receber devoluções';
  end if;

  select * into target from public.order_returns where id=p_return_id for update;
  if target.id is null then raise exception 'Devolução não encontrada'; end if;
  if target.status not in('approved','requested') then return target.id; end if;

  -- Uma venda consignada devolvida não pode manter repasse financeiro em aberto.
  -- Se o repasse já saiu, a equipe precisa regularizar antes de receber a peça para
  -- evitar devolver estoque e manter um pagamento irreversivelmente marcado como quitado.
  if exists(
    select 1
      from public.order_return_items ri
      join public.consignment_settlements cs on cs.order_item_id=ri.order_item_id
     where ri.return_id=target.id
       and cs.status='paid'
  ) then
    raise exception 'Há repasse de consignação já pago nesta devolução. Regularize o repasse antes de receber a peça';
  end if;

  update public.consignment_settlements cs
     set status='cancelled'
    from public.order_return_items ri
   where ri.return_id=target.id
     and ri.order_item_id=cs.order_item_id
     and cs.status='pending';

  for item in select * from public.order_return_items where return_id=target.id and status='pending' for update
  loop
    if p_restock and item.product_id is not null then
      update public.products set stock=stock+item.quantity,active=true,updated_at=now() where id=item.product_id;
    end if;
    update public.order_return_items
       set status='received',restocked=(p_restock and item.product_id is not null)
     where id=item.id;
  end loop;

  update public.order_returns
     set status=case when resolution='exchange' then 'completed' else 'received' end,
         received_at=now(),
         completed_at=case when resolution='exchange' then now() else completed_at end
   where id=target.id;

  return target.id;
end;
$$;

revoke all on function public.receive_order_return(uuid,boolean) from public,anon;
grant execute on function public.receive_order_return(uuid,boolean) to authenticated,service_role;

create or replace function public.confirm_manual_order_refund(p_return_id uuid,p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.order_returns%rowtype;
  entry_id uuid;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para confirmar reembolsos';
  end if;

  select * into target from public.order_returns where id=p_return_id for update;
  if target.id is null then raise exception 'Devolução não encontrada'; end if;
  if target.resolution<>'refund' then raise exception 'Esta operação é uma troca e não exige reembolso'; end if;
  if target.status<>'received' then raise exception 'Receba a peça antes de confirmar o reembolso'; end if;
  if target.refund_status='completed' then
    select financial_entries.id into entry_id
      from public.financial_entries
     where category='Reembolso de venda' and description like '%'||target.id::text||'%'
     order by created_at desc limit 1;
    return entry_id;
  end if;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values(
    'expense','Reembolso de venda','Devolução '||target.id::text,
    target.refund_amount,current_date,now(),'paid'
  ) returning id into entry_id;

  update public.order_returns
     set refund_status='completed',refund_reference=nullif(trim(coalesce(p_reference,'')),''),
         status='completed',completed_at=now()
   where id=target.id;

  return entry_id;
end;
$$;

revoke all on function public.confirm_manual_order_refund(uuid,text) from public,anon;
grant execute on function public.confirm_manual_order_refund(uuid,text) to authenticated,service_role;

-- AUDIT-RLS-SCOPE-2026-10
-- RLS explícito por papel e privilégios padrão seguros para novos objetos.
-- Consolida policies permissivas sobrepostas sem ampliar o acesso existente.

-- Novos objetos deixam de nascer expostos ao cliente por padrão.
alter default privileges for role postgres in schema public
  revoke select,insert,update,delete on tables from anon,authenticated;
alter default privileges for role postgres in schema public
  revoke usage,select on sequences from anon,authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public,anon,authenticated;

-- Catálogo: visitante vê ativo; equipe também pode ver inativo.
drop policy if exists "catalogo publico" on public.products;
drop policy if exists "equipe consulta produtos" on public.products;
create policy "catalogo ou equipe consulta produtos" on public.products
  for select to anon,authenticated
  using (active=true or has_system_role(array['admin','manager','cashier','inventory']));

drop policy if exists "admin cadastra produtos" on public.products;
create policy "admin cadastra produtos" on public.products
  for insert to authenticated with check(is_admin());
drop policy if exists "admin atualiza produtos" on public.products;
create policy "admin atualiza produtos" on public.products
  for update to authenticated using(is_admin()) with check(is_admin());
drop policy if exists "admin exclui produtos" on public.products;
create policy "admin exclui produtos" on public.products
  for delete to authenticated using(is_admin());

-- Pedidos e itens: uma única policy de leitura por tabela.
drop policy if exists "cliente ve pedidos" on public.orders;
drop policy if exists "gerencia consulta pedidos" on public.orders;
create policy "cliente ou equipe ve pedidos" on public.orders
  for select to authenticated
  using ((customer_id=(select auth.uid())) or has_system_role(array['admin','manager','cashier']));

drop policy if exists "admin atualiza pedidos" on public.orders;
create policy "admin atualiza pedidos" on public.orders
  for update to authenticated using(is_admin()) with check(is_admin());

drop policy if exists "cliente ve itens" on public.order_items;
drop policy if exists "gerencia consulta itens" on public.order_items;
create policy "cliente ou equipe ve itens" on public.order_items
  for select to authenticated
  using (
    exists(
      select 1 from public.orders
      where orders.id=order_items.order_id
        and ((orders.customer_id=(select auth.uid())) or has_system_role(array['admin','manager','cashier']))
    )
  );

-- Perfis: próprio perfil ou gestão.
drop policy if exists "perfil proprio" on public.profiles;
drop policy if exists "gerencia consulta perfis" on public.profiles;
create policy "proprio ou gestao consulta perfis" on public.profiles
  for select to authenticated
  using ((id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "admin gerencia perfis" on public.profiles;
create policy "admin gerencia perfis" on public.profiles
  for update to authenticated using(is_admin()) with check(is_admin());

-- Doações: somente usuário autenticado e gestão.
drop policy if exists "cliente acompanha doacao" on public.donations;
drop policy if exists "gerencia consulta doacoes" on public.donations;
create policy "cliente ou gestao consulta doacoes" on public.donations
  for select to authenticated
  using ((donor_id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "cliente cria doacao" on public.donations;
create policy "cliente cria doacao" on public.donations
  for insert to authenticated with check(donor_id=(select auth.uid()));
drop policy if exists "admin gerencia doacao" on public.donations;
create policy "admin gerencia doacao" on public.donations
  for update to authenticated using(is_admin()) with check(is_admin());

-- Endereços e módulos operacionais nunca precisam da role anon.
drop policy if exists "cliente ve enderecos" on public.customer_addresses;
create policy "cliente ve enderecos" on public.customer_addresses
  for select to authenticated using(customer_id=(select auth.uid()));
drop policy if exists "cliente cria enderecos" on public.customer_addresses;
create policy "cliente cria enderecos" on public.customer_addresses
  for insert to authenticated
  with check (
    customer_id=(select auth.uid())
    and exists(select 1 from public.profiles where id=(select auth.uid()) and role='customer'::user_role)
  );
drop policy if exists "cliente exclui enderecos" on public.customer_addresses;
create policy "cliente exclui enderecos" on public.customer_addresses
  for delete to authenticated using(customer_id=(select auth.uid()));

drop policy if exists "equipe ve caixas" on public.cash_sessions;
create policy "equipe ve caixas" on public.cash_sessions
  for select to authenticated
  using ((operator_id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "equipe ve movimentos" on public.cash_movements;
create policy "equipe ve movimentos" on public.cash_movements
  for select to authenticated
  using ((operator_id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "gestao financeiro" on public.financial_entries;
create policy "gestao financeiro" on public.financial_entries
  for all to authenticated
  using (has_system_role(array['admin','manager']))
  with check (has_system_role(array['admin','manager']));

drop policy if exists "admin consulta auditoria" on public.audit_logs;
create policy "admin consulta auditoria" on public.audit_logs
  for select to authenticated using(has_system_role(array['admin']));

-- RH: leitura própria ou gestão; escrita exclusivamente gestão, sem policy ALL sobrepondo SELECT.
drop policy if exists "admin gerencia rh" on public.employee_details;
drop policy if exists "gestao ve rh" on public.employee_details;
create policy "equipe ve rh" on public.employee_details
  for select to authenticated
  using ((profile_id=(select auth.uid())) or has_system_role(array['admin','manager']));
create policy "gestao cria rh" on public.employee_details
  for insert to authenticated with check(has_system_role(array['admin','manager']));
create policy "gestao atualiza rh" on public.employee_details
  for update to authenticated using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "gestao exclui rh" on public.employee_details
  for delete to authenticated using(has_system_role(array['admin','manager']));

-- Ponto: funcionário lê o próprio; gestão corrige.
drop policy if exists "equipe ve ponto" on public.time_entries;
drop policy if exists "gestao corrige ponto" on public.time_entries;
create policy "equipe ve ponto" on public.time_entries
  for select to authenticated
  using ((employee_id=(select auth.uid())) or has_system_role(array['admin','manager']));
create policy "gestao cria ponto" on public.time_entries
  for insert to authenticated with check(has_system_role(array['admin','manager']));
create policy "gestao atualiza ponto" on public.time_entries
  for update to authenticated using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "gestao exclui ponto" on public.time_entries
  for delete to authenticated using(has_system_role(array['admin','manager']));

drop policy if exists "cliente ve rastreio" on public.tracking_events;
create policy "cliente ve rastreio" on public.tracking_events
  for select to authenticated
  using (
    exists(
      select 1 from public.orders
      where orders.id=tracking_events.order_id
        and ((orders.customer_id=(select auth.uid())) or has_system_role(array['admin','manager']))
    )
  );
drop policy if exists "equipe registra rastreio" on public.tracking_events;
create policy "equipe registra rastreio" on public.tracking_events
  for insert to authenticated with check(has_system_role(array['admin','manager']));

-- Configuração pública continua pública; alteração fica autenticada/admin.
drop policy if exists "configuracao publica" on public.store_settings;
create policy "configuracao publica" on public.store_settings
  for select to anon,authenticated using(true);
drop policy if exists "admin personaliza loja" on public.store_settings;
create policy "admin personaliza loja" on public.store_settings
  for update to authenticated using(is_admin()) with check(is_admin());

-- Cupons: leitura e escrita administrativas; validação do cliente continua pela RPC validate_coupon.
drop policy if exists "admin consulta cupons" on public.coupons;
create policy "admin consulta cupons" on public.coupons
  for select to authenticated using(is_admin());
drop policy if exists "admin cria cupons" on public.coupons;
create policy "admin cria cupons" on public.coupons
  for insert to authenticated with check(is_admin());
drop policy if exists "admin atualiza cupons" on public.coupons;
create policy "admin atualiza cupons" on public.coupons
  for update to authenticated using(is_admin()) with check(is_admin());
drop policy if exists "admin exclui cupons" on public.coupons;
create policy "admin exclui cupons" on public.coupons
  for delete to authenticated using(is_admin());

-- AUDIT-POST-APPLY-ADVISOR-2026-10
-- Pós-aplicação das migrations de entrada/consignação e pós-venda.
-- Fecha execução anônima dos helpers de autorização e cobre as novas FKs apontadas pelo Advisor.

create index if not exists consignors_created_by_idx
  on public.consignors(created_by);

create index if not exists consignment_settlements_intake_item_id_idx
  on public.consignment_settlements(intake_item_id);

create index if not exists consignment_settlements_product_id_idx
  on public.consignment_settlements(product_id);

create index if not exists consignment_settlements_financial_entry_id_idx
  on public.consignment_settlements(financial_entry_id);

-- Helpers de autorização são usados internamente por policies/RPCs autenticadas.
-- Visitantes anônimos não precisam chamá-los diretamente via Data API.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.has_system_role(text[]) from anon;

grant execute on function public.is_admin() to authenticated,service_role;
grant execute on function public.has_system_role(text[]) to authenticated,service_role;

-- AUDIT-AUTH-HELPER-EXECUTE-2026-10
-- Corrige herança de EXECUTE via PUBLIC nos helpers SECURITY DEFINER.
-- Authenticated continua usando os helpers internamente nas policies e RPCs.

revoke execute on function public.is_admin() from public,anon;
revoke execute on function public.has_system_role(text[]) from public,anon;

grant execute on function public.is_admin() to authenticated,service_role;
grant execute on function public.has_system_role(text[]) to authenticated,service_role;

-- AUDIT-CONSIGNOR-BATCH-SETTLEMENT-2026-10
-- Fechamento consolidado de repasses por consignante.
-- Agrupa todos os repasses liberados em um único lançamento financeiro e baixa atômica.

create index if not exists consignment_settlements_consignor_status_available_idx
  on public.consignment_settlements(consignor_id,status,available_at);

create or replace function public.pay_consignor_settlements(
  p_consignor_id uuid,
  p_payment_reference text default null
)
returns table(financial_entry_id uuid, settlements_count integer, total_amount numeric)
language plpgsql
security definer
set search_path=public
as $$
declare
  owner_name text;
  total numeric(10,2);
  qty integer;
  entry_id uuid;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para registrar repasses';
  end if;

  select name into owner_name
    from public.consignors
   where id=p_consignor_id and active=true;

  if owner_name is null then
    raise exception 'Consignante não encontrado ou inativo';
  end if;

  -- O FOR UPDATE garante que duas baixas simultâneas não paguem o mesmo repasse.
  with locked as (
    select id,payout_amount
      from public.consignment_settlements
     where consignor_id=p_consignor_id
       and status='pending'
       and available_at<=now()
     order by id
     for update
  )
  select coalesce(sum(payout_amount),0),count(*)::integer
    into total,qty
    from locked;

  if qty=0 or total<=0 then
    raise exception 'Nenhum repasse liberado para este consignante';
  end if;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values(
    'expense',
    'Repasse de consignação',
    'Repasse consolidado para '||owner_name||' ('||qty||' item(ns))',
    total,current_date,now(),'paid'
  )
  returning id into entry_id;

  update public.consignment_settlements
     set status='paid',
         paid_at=now(),
         payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),
         financial_entry_id=entry_id
   where consignor_id=p_consignor_id
     and status='pending'
     and available_at<=now();

  return query select entry_id,qty,total;
end;
$$;

revoke all on function public.pay_consignor_settlements(uuid,text) from public,anon;
grant execute on function public.pay_consignor_settlements(uuid,text) to authenticated,service_role;

-- AUDIT-GATEWAY-REFUNDS-2026-10
-- Reembolso automático via gateway com baixa financeira atômica.
-- A API server-side registra o resultado do provedor; clientes não executam esta RPC diretamente.

alter table public.order_returns add column if not exists refund_provider text;
alter table public.order_returns add column if not exists refund_gateway_status text;

create or replace function public.record_gateway_order_refund(
  p_return_id uuid,
  p_provider text,
  p_reference text,
  p_gateway_status text,
  p_completed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.order_returns%rowtype;
  entry_id uuid;
begin
  select * into target
    from public.order_returns
   where id=p_return_id
   for update;

  if target.id is null then raise exception 'Devolução não encontrada'; end if;
  if target.resolution<>'refund' then raise exception 'Esta operação não exige reembolso'; end if;
  if target.status not in('received','completed') then raise exception 'Receba a peça antes de processar o reembolso'; end if;

  if target.refund_status='completed' then
    select id into entry_id
      from public.financial_entries
     where category='Reembolso de venda'
       and description like 'Devolução '||target.id::text||'%'
     order by created_at desc limit 1;
    return entry_id;
  end if;

  update public.order_returns
     set refund_provider=nullif(trim(coalesce(p_provider,'')),''),
         refund_reference=nullif(trim(coalesce(p_reference,'')),''),
         refund_gateway_status=nullif(trim(coalesce(p_gateway_status,'')),''),
         refund_status=case
           when p_completed then 'completed'
           when lower(coalesce(p_gateway_status,'')) in('failed','canceled','cancelled') then 'failed'
           else 'pending'
         end,
         status=case when p_completed then 'completed' else status end,
         completed_at=case when p_completed then now() else completed_at end
   where id=target.id;

  if not p_completed then return null; end if;

  select id into entry_id
    from public.financial_entries
   where category='Reembolso de venda'
     and description like 'Devolução '||target.id::text||'%'
   order by created_at desc limit 1;

  if entry_id is null then
    insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
    values(
      'expense',
      'Reembolso de venda',
      'Devolução '||target.id::text||' · '||coalesce(nullif(trim(p_provider),''),'gateway'),
      target.refund_amount,current_date,now(),'paid'
    )
    returning id into entry_id;
  end if;

  return entry_id;
end;
$$;

revoke all on function public.record_gateway_order_refund(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_gateway_order_refund(uuid,text,text,text,boolean) to service_role;

create or replace function public.confirm_manual_order_refund(p_return_id uuid,p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.order_returns%rowtype;
  entry_id uuid;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para confirmar reembolsos';
  end if;

  select * into target from public.order_returns where id=p_return_id for update;
  if target.id is null then raise exception 'Devolução não encontrada'; end if;
  if target.resolution<>'refund' then raise exception 'Esta operação é uma troca e não exige reembolso'; end if;
  if target.status<>'received' then raise exception 'Receba a peça antes de confirmar o reembolso'; end if;
  if target.refund_status='completed' then
    select financial_entries.id into entry_id
      from public.financial_entries
     where category='Reembolso de venda' and description like 'Devolução '||target.id::text||'%'
     order by created_at desc limit 1;
    return entry_id;
  end if;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values(
    'expense','Reembolso de venda','Devolução '||target.id::text||' · manual',
    target.refund_amount,current_date,now(),'paid'
  ) returning id into entry_id;

  update public.order_returns
     set refund_status='completed',
         refund_provider='manual',
         refund_reference=nullif(trim(coalesce(p_reference,'')),''),
         refund_gateway_status='confirmed',
         status='completed',
         completed_at=now()
   where id=target.id;

  return entry_id;
end;
$$;

revoke all on function public.confirm_manual_order_refund(uuid,text) from public,anon;
grant execute on function public.confirm_manual_order_refund(uuid,text) to authenticated,service_role;

-- AUDIT-RETURN-DISCOUNT-PRORATION-2026-10
-- Corrige o cálculo de devolução para respeitar descontos do pedido.
-- O desconto comercial é rateado proporcionalmente pelos itens; frete não é reembolsado automaticamente.

create or replace function public.create_order_return(
  p_order_id uuid,
  p_items jsonb,
  p_reason text,
  p_resolution text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target_order public.orders%rowtype;
  requested record;
  source_item public.order_items%rowtype;
  new_return_id uuid;
  returned_subtotal numeric:=0;
  merchandise_net numeric:=0;
  total_refund numeric:=0;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para abrir devoluções';
  end if;
  if p_resolution not in('refund','exchange') then raise exception 'Solução de pós-venda inválida'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo da devolução'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Selecione ao menos um item';
  end if;

  select * into target_order from public.orders where id=p_order_id for update;
  if target_order.id is null then raise exception 'Pedido não encontrado'; end if;
  if target_order.status not in('pago','separando','enviado','concluido') then
    raise exception 'Este pedido ainda não pode entrar em pós-venda';
  end if;

  for requested in
    select (value->>'order_item_id')::uuid as order_item_id,
           greatest(1,coalesce((value->>'quantity')::integer,1)) as quantity
    from jsonb_array_elements(p_items)
  loop
    select * into source_item from public.order_items
      where id=requested.order_item_id and order_id=target_order.id;
    if source_item.id is null then raise exception 'Item não pertence ao pedido'; end if;
    if requested.quantity>source_item.quantity then raise exception 'Quantidade devolvida excede a quantidade vendida'; end if;
    if exists(
      select 1 from public.order_return_items ri
      join public.order_returns r on r.id=ri.return_id
      where ri.order_item_id=source_item.id and r.status not in('rejected')
    ) then
      raise exception 'Este item já possui uma devolução ativa';
    end if;
    returned_subtotal:=returned_subtotal+(source_item.unit_price*requested.quantity);
  end loop;

  merchandise_net:=greatest(0,coalesce(target_order.subtotal,0)-coalesce(target_order.discount,0));
  if coalesce(target_order.subtotal,0)>0 then
    total_refund:=round(returned_subtotal*(merchandise_net/target_order.subtotal),2);
  else
    total_refund:=0;
  end if;
  total_refund:=least(total_refund,merchandise_net);

  if p_resolution='refund' and total_refund<=0 then
    raise exception 'Pedido sem valor de mercadoria disponível para reembolso';
  end if;

  insert into public.order_returns(order_id,customer_id,resolution,reason,status,refund_amount,refund_status,approved_at)
  values(
    target_order.id,target_order.customer_id,p_resolution,trim(p_reason),'approved',
    case when p_resolution='refund' then total_refund else 0 end,
    case when p_resolution='refund' then 'pending' else 'not_required' end,now()
  ) returning id into new_return_id;

  for requested in
    select (value->>'order_item_id')::uuid as order_item_id,
           greatest(1,coalesce((value->>'quantity')::integer,1)) as quantity
    from jsonb_array_elements(p_items)
  loop
    select * into source_item from public.order_items where id=requested.order_item_id;
    insert into public.order_return_items(return_id,order_item_id,product_id,quantity,unit_price)
    values(new_return_id,source_item.id,source_item.product_id,requested.quantity,source_item.unit_price);
  end loop;

  return new_return_id;
end;
$$;

revoke all on function public.create_order_return(uuid,jsonb,text,text) from public,anon;
grant execute on function public.create_order_return(uuid,jsonb,text,text) to authenticated,service_role;

-- AUDIT-UNSOLD-CONSIGNMENT-RETURN-2026-10
-- Devolução de peça consignada não vendida ao proprietário.
-- Remove a peça do catálogo/PDV e encerra o ciclo operacional sem gerar repasse.

alter table public.inventory_intake_items add column if not exists returned_at timestamptz;
alter table public.inventory_intake_items add column if not exists return_reason text;

create index if not exists inventory_intake_items_status_idx
  on public.inventory_intake_items(status,updated_at desc);

create or replace function public.return_consigned_item(
  p_item_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  item public.inventory_intake_items%rowtype;
  intake public.inventory_intakes%rowtype;
  product_stock integer;
begin
  if not has_system_role(array['admin','manager','inventory']) then
    raise exception 'Conta sem permissão para devolver peças consignadas';
  end if;

  select * into item
    from public.inventory_intake_items
   where id=p_item_id
   for update;

  if item.id is null then raise exception 'Peça não encontrada'; end if;
  if item.status='returned' then return item.id; end if;
  if item.status not in('pending','listed') then
    raise exception 'Esta peça não pode ser devolvida neste status';
  end if;

  select * into intake
    from public.inventory_intakes
   where id=item.intake_id
   for update;

  if intake.id is null or intake.source_type<>'consignment' then
    raise exception 'Somente peças consignadas podem ser devolvidas ao proprietário';
  end if;

  if item.product_id is not null then
    select stock into product_stock
      from public.products
     where id=item.product_id
     for update;

    if coalesce(product_stock,0)<=0 then
      raise exception 'A peça não está disponível em estoque para devolução';
    end if;

    update public.products
       set active=false,stock=0,updated_at=now()
     where id=item.product_id;
  end if;

  update public.inventory_intake_items
     set status='returned',
         returned_at=now(),
         return_reason=nullif(trim(coalesce(p_reason,'')),''),
         updated_at=now()
   where id=item.id;

  if not exists(
    select 1
      from public.inventory_intake_items
     where intake_id=intake.id
       and status in('pending','listed')
  ) then
    update public.inventory_intakes
       set status='closed',updated_at=now()
     where id=intake.id;
  end if;

  return item.id;
end;
$$;

revoke all on function public.return_consigned_item(uuid,text) from public,anon;
grant execute on function public.return_consigned_item(uuid,text) to authenticated,service_role;

-- AUDIT-PURCHASE-ACQUISITION-FINANCE-2026-10
-- Integra compras próprias de peças ao financeiro.
-- O custo é reconhecido quando a peça é aprovada/publicada; doações e consignações não geram esta despesa.

alter table public.inventory_intake_items
  add column if not exists acquisition_financial_entry_id uuid
  references public.financial_entries(id) on delete set null;

create index if not exists inventory_intake_items_acquisition_financial_entry_id_idx
  on public.inventory_intake_items(acquisition_financial_entry_id);

create or replace function public.approve_intake_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  item public.inventory_intake_items%rowtype;
  intake public.inventory_intakes%rowtype;
  new_product_id uuid;
  generated_sku text;
  first_image text;
  acquisition_entry_id uuid;
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

  if intake.source_type='purchase' and item.acquisition_cost>0 then
    if item.acquisition_financial_entry_id is null then
      insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
      values(
        'expense',
        'Compra de peças',
        'Aquisição de peça · '||item.name||' · '||item.id::text,
        item.acquisition_cost,current_date,now(),'paid'
      )
      returning id into acquisition_entry_id;
    else
      acquisition_entry_id:=item.acquisition_financial_entry_id;
    end if;
  end if;

  insert into public.products(name,description,category,size,price,stock,image_url,active,sku,brand,color,condition_grade)
  values(item.name,item.description,item.category,item.size,item.sale_price,1,first_image,true,generated_sku,item.brand,item.color,item.condition_grade)
  returning id into new_product_id;

  update public.inventory_intake_items
     set product_id=new_product_id,
         status='listed',
         acquisition_financial_entry_id=coalesce(acquisition_entry_id,acquisition_financial_entry_id),
         updated_at=now()
   where id=item.id;

  if not exists(
    select 1 from public.inventory_intake_items
     where intake_id=intake.id and status='pending'
  ) then
    update public.inventory_intakes set status='approved',updated_at=now() where id=intake.id;
  end if;

  return new_product_id;
end;
$$;

revoke all on function public.approve_intake_item(uuid) from public,anon;
grant execute on function public.approve_intake_item(uuid) to authenticated,service_role;
