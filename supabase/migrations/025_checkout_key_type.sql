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
