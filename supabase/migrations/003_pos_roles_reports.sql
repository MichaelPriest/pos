-- Perfis de equipe, PDV e permissões de relatórios.
alter type public.user_role add value if not exists 'manager';
alter type public.user_role add value if not exists 'cashier';
alter type public.user_role add value if not exists 'inventory';

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

alter table public.store_settings add column if not exists support_email text;
alter table public.store_settings add column if not exists free_shipping_threshold numeric(10,2) default 250;
alter table public.store_settings add column if not exists pickup_enabled boolean default true;
alter table public.store_settings add column if not exists maintenance_mode boolean default false;
alter table public.store_settings add column if not exists seo_title text;
alter table public.store_settings add column if not exists seo_description text;
