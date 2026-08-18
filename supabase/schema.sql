-- Execute este arquivo uma vez no SQL Editor do Supabase.
create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'customer');
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
  hero_image text, whatsapp text, instagram text, updated_at timestamptz not null default now()
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
