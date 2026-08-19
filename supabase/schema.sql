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
