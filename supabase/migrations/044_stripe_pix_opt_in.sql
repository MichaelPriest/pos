-- Pix Stripe opt-in: merchant must first confirm Pix availability in Stripe Dashboard.
-- Default OFF avoids exposing a method not enabled for the payment account.
alter table public.store_settings add column if not exists stripe_pix_enabled boolean not null default false;

CREATE OR REPLACE FUNCTION public.create_order(payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  quote_id uuid;
  shipping_quote public.shipping_quotes%rowtype;
  order_service text;
  order_carrier text;
  order_provider text;
  order_service_id text;
  provider_quote numeric;
  provider_days integer;
  destination_postal text;
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

  if nullif(trim(payload->>'shipping_quote_id'),'') is not null then
    begin
      quote_id:=(payload->>'shipping_quote_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Cotação de frete inválida';
    end;
  end if;

  select name into profile_name from profiles where id=auth.uid();
  select * into store_config from store_settings where id=1;
  if store_config.id is null then raise exception 'Configuração da loja indisponível'; end if;
  if store_config.maintenance_mode then raise exception 'A loja está temporariamente em manutenção'; end if;
  if payment_method not in ('pix','cartao') then raise exception 'Forma de pagamento inválida'; end if;
  if payment_method='pix' and (not coalesce(store_config.pix_enabled,true) or not (coalesce(store_config.mercadopago_enabled,false) or coalesce(store_config.pagbank_enabled,false) or (coalesce(store_config.stripe_enabled,false) and coalesce(store_config.stripe_pix_enabled,false)))) then raise exception 'Pix indisponível'; end if;
  if payment_method='cartao' and (not coalesce(store_config.card_enabled,true) or not (coalesce(store_config.stripe_enabled,false) or coalesce(store_config.mercadopago_enabled,false))) then raise exception 'Cartão indisponível'; end if;

  if quote_id is null and shipping_method not in ('Correios PAC','Entrega expressa','Retirada na loja') then
    raise exception 'Forma de entrega inválida';
  end if;
  if quote_id is null and shipping_method='Retirada na loja' and not coalesce(store_config.pickup_enabled,false) then
    raise exception 'Retirada na loja indisponível';
  end if;

  if (quote_id is not null or shipping_method<>'Retirada na loja') and (
    nullif(trim(payload->'shipping_address'->>'zip_code'),'') is null or
    nullif(trim(payload->'shipping_address'->>'street'),'') is null or
    nullif(trim(payload->'shipping_address'->>'number'),'') is null or
    nullif(trim(payload->'shipping_address'->>'city'),'') is null or
    nullif(trim(payload->'shipping_address'->>'state'),'') is null
  ) then raise exception 'Endereço de entrega incompleto'; end if;

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

  if quote_id is not null then
    select * into shipping_quote
      from public.shipping_quotes
     where id=quote_id and customer_id=auth.uid()
       and expires_at>now() and consumed_at is null
     for update;
    if shipping_quote.id is null then raise exception 'Cotação de frete expirada ou indisponível'; end if;

    destination_postal:=regexp_replace(coalesce(payload->'shipping_address'->>'zip_code',''),'[^0-9]','','g');
    if shipping_quote.postal_code<>destination_postal then raise exception 'O CEP mudou; recalcule o frete'; end if;
    if round(shipping_quote.merchandise_subtotal,2)<>round(order_subtotal,2) then raise exception 'A sacola mudou; recalcule o frete'; end if;
    if round(shipping_quote.discount_value,2)<>round(discount_value,2) then raise exception 'O desconto mudou; recalcule o frete'; end if;
    if coalesce(shipping_quote.coupon_code,'')<>coupon then raise exception 'O cupom mudou; recalcule o frete'; end if;

    freight:=case
      when coalesce(store_config.free_shipping_threshold,0)>0 and order_subtotal>=store_config.free_shipping_threshold then 0
      else shipping_quote.quoted_amount
    end;
    order_service:=shipping_quote.service_name;
    order_carrier:=shipping_quote.carrier;
    order_provider:=shipping_quote.provider;
    order_service_id:=shipping_quote.service_id;
    provider_quote:=shipping_quote.quoted_amount;
    provider_days:=shipping_quote.delivery_days;
  else
    freight:=case
      when shipping_method='Retirada na loja' then 0
      when coalesce(store_config.free_shipping_threshold,0)>0 and order_subtotal>=store_config.free_shipping_threshold then 0
      when shipping_method='Entrega expressa' then store_config.express_shipping_cost
      else store_config.standard_shipping_cost
    end;
    order_service:=shipping_method;
  end if;

  insert into orders(
    customer_id,customer_name,subtotal,discount,total,status,payment_method,
    shipping_address,shipping_service,shipping_cost,checkout_key,coupon_code,
    carrier,shipping_provider,shipping_service_id,shipping_quote_amount,
    shipping_quote_days,shipping_quote_id
  )
  values(
    auth.uid(),profile_name,order_subtotal,discount_value,order_subtotal-discount_value+freight,
    'pendente',payment_method,payload->'shipping_address',
    order_service,freight,request_key,nullif(coupon,''),
    order_carrier,order_provider,order_service_id,provider_quote,provider_days,quote_id
  )
  returning id into new_id;

  if quote_id is not null then
    update public.shipping_quotes set consumed_at=now() where id=quote_id;
  end if;

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
end;
$function$;

revoke execute on function public.create_order(jsonb) from public,anon;
grant execute on function public.create_order(jsonb) to authenticated,service_role;
