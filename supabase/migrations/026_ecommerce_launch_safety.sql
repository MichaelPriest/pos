-- Calcula frete e transições críticas no banco, sem confiar em valores enviados pelo navegador.
alter table public.store_settings
  add column if not exists standard_shipping_cost numeric(10,2) not null default 19.90,
  add column if not exists express_shipping_cost numeric(10,2) not null default 34.90;

do $$ begin
  alter table public.store_settings add constraint store_settings_standard_shipping_cost_nonnegative check (standard_shipping_cost >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.store_settings add constraint store_settings_express_shipping_cost_nonnegative check (express_shipping_cost >= 0);
exception when duplicate_object then null; end $$;

alter table public.webhook_events
  add column if not exists updated_at timestamptz not null default now();

-- Escritas de pedidos passam exclusivamente pelas RPCs transacionais abaixo.
drop policy if exists "admin atualiza pedidos" on public.orders;

create or replace function public.claim_webhook_event(p_provider text,p_event_id text,p_payload jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
declare claimed_id uuid; target webhook_events%rowtype;
begin
  if nullif(trim(coalesce(p_provider,'')),'') is null or nullif(trim(coalesce(p_event_id,'')),'') is null then
    raise exception 'Webhook inválido';
  end if;
  insert into webhook_events(provider,event_id,payload,updated_at)
    values(p_provider,p_event_id,coalesce(p_payload,'{}'::jsonb),now())
    on conflict(provider,event_id) do nothing returning id into claimed_id;
  if claimed_id is not null then return true; end if;
  select * into target from webhook_events
    where provider=p_provider and event_id=p_event_id for update;
  if target.status='processed' then return false; end if;
  if target.status='processing' and target.updated_at>now()-interval '5 minutes' then return false; end if;
  update webhook_events set status='processing',attempts=attempts+1,last_error=null,updated_at=now()
    where id=target.id;
  return true;
end; $$;

create or replace function public.create_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  new_id uuid;
  requested record;
  product_record products%rowtype;
  store_record store_settings%rowtype;
  order_subtotal numeric:=0;
  freight numeric:=0;
  discount_value numeric:=0;
  profile_name text;
  request_key text;
  method text;
  shipping_method text;
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

  select * into store_record from store_settings where id=1;
  if store_record.id is null then raise exception 'Configuração da loja indisponível'; end if;
  method:=lower(trim(coalesce(payload->>'payment_method','')));
  if method='cartão' then method:='cartao'; end if;
  if method='pix' and not (store_record.pix_enabled and (store_record.mercadopago_enabled or store_record.pagbank_enabled)) then
    raise exception 'Pix indisponível no momento';
  elsif method='cartao' and not (store_record.card_enabled and (store_record.stripe_enabled or store_record.mercadopago_enabled)) then
    raise exception 'Cartão indisponível no momento';
  elsif method not in ('pix','cartao') then
    raise exception 'Forma de pagamento inválida';
  end if;

  if payload->'items' is null or jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then
    raise exception 'A sacola está vazia';
  end if;
  select name into profile_name from profiles where id=auth.uid();

  -- UUIDs ordenados evitam deadlock entre checkouts concorrentes.
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

  shipping_method:=trim(coalesce(payload->>'shipping_method',''));
  if shipping_method='Retirada na loja' then
    if not store_record.pickup_enabled then raise exception 'Retirada na loja indisponível'; end if;
    freight:=0;
  elsif shipping_method='Correios PAC' then
    if payload->'shipping_address' is null or jsonb_typeof(payload->'shipping_address')<>'object'
      or nullif(trim(payload->'shipping_address'->>'zip_code'),'') is null
      or nullif(trim(payload->'shipping_address'->>'street'),'') is null
      or nullif(trim(payload->'shipping_address'->>'number'),'') is null
      or nullif(trim(payload->'shipping_address'->>'city'),'') is null
      or nullif(trim(payload->'shipping_address'->>'state'),'') is null then
      raise exception 'Endereço de entrega incompleto';
    end if;
    freight:=case when order_subtotal-discount_value>=coalesce(store_record.free_shipping_threshold,250)
      then 0 else store_record.standard_shipping_cost end;
  elsif shipping_method='Entrega expressa' then
    if payload->'shipping_address' is null or jsonb_typeof(payload->'shipping_address')<>'object'
      or nullif(trim(payload->'shipping_address'->>'zip_code'),'') is null
      or nullif(trim(payload->'shipping_address'->>'street'),'') is null
      or nullif(trim(payload->'shipping_address'->>'number'),'') is null
      or nullif(trim(payload->'shipping_address'->>'city'),'') is null
      or nullif(trim(payload->'shipping_address'->>'state'),'') is null then
      raise exception 'Endereço de entrega incompleto';
    end if;
    freight:=store_record.express_shipping_cost;
  else
    raise exception 'Forma de entrega inválida';
  end if;

  insert into orders(customer_id,customer_name,subtotal,discount,total,status,payment_method,
    shipping_address,shipping_service,shipping_cost,checkout_key,coupon_code)
  values(auth.uid(),profile_name,order_subtotal,discount_value,order_subtotal-discount_value+freight,
    'pendente',method,payload->'shipping_address',shipping_method,freight,request_key,nullif(coupon,''))
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

-- Somente transições operacionais explícitas podem ser feitas pelo painel.
create or replace function public.transition_order_status(p_order_id uuid,p_status text) returns order_status
language plpgsql security definer set search_path=public as $$
declare target orders%rowtype; next_status order_status;
begin
  if not has_system_role(array['admin','manager']) then raise exception 'Conta sem permissão para alterar pedidos'; end if;
  select * into target from orders where id=p_order_id for update;
  if target.id is null then raise exception 'Pedido não encontrado'; end if;
  begin
    next_status:=p_status::order_status;
  exception when invalid_text_representation then
    raise exception 'Status inválido';
  end;
  if next_status=target.status then return target.status; end if;
  if target.status='pendente' and next_status='cancelado' then
    return reconcile_order_payment(target.id,'cancelado',target.payment_reference);
  end if;
  if not (
    (target.status='pago' and next_status='separando')
    or (target.status='enviado' and next_status='concluido')
    or (target.status='separando' and next_status='concluido' and target.shipping_service='Retirada na loja')
  ) then
    raise exception 'Transição de status não permitida';
  end if;
  update orders set status=next_status where id=target.id;
  return next_status;
end; $$;

-- Enquanto não existe conciliação TEF/PIX no PDV, apenas dinheiro pode concluir venda como paga.
create or replace function public.create_pos_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  new_id uuid; requested record; product_record products%rowtype; sid uuid;
  subtotal numeric:=0; discount numeric:=0; method text; receipt text;
begin
  if not has_system_role(array['admin','manager','cashier']) then raise exception 'Acesso ao caixa não autorizado'; end if;
  select id into sid from cash_sessions where operator_id=auth.uid() and status='open'
    order by opened_at desc limit 1 for update;
  if sid is null then raise exception 'Abra o caixa antes de realizar vendas'; end if;
  if payload->'items' is null or jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then
    raise exception 'Adicione um produto';
  end if;
  method:=lower(trim(coalesce(payload->>'payment_method','dinheiro')));
  if method<>'dinheiro' then raise exception 'Pix e cartão no PDV exigem confirmação da adquirente'; end if;
  receipt:=lower(trim(coalesce(payload->>'receipt_type','nao_fiscal')));
  if receipt<>'nao_fiscal' then raise exception 'Emissão fiscal ainda não está integrada'; end if;
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
  if discount>0 and not has_system_role(array['admin','manager']) then raise exception 'Desconto exige autorização da gerência'; end if;
  insert into orders(customer_id,customer_name,subtotal,discount,total,status,payment_method,payment_provider,receipt_type,customer_document)
    values(auth.uid(),coalesce(nullif(trim(payload->>'customer_name'),''),'Consumidor final'),subtotal,discount,
      subtotal-discount,'pago','dinheiro','pdv','nao_fiscal',nullif(trim(payload->>'customer_document'),''))
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
  insert into cash_movements(session_id,operator_id,type,amount,reason,order_id)
    values(sid,auth.uid(),'sale',subtotal-discount,'Venda presencial',new_id);
  return new_id;
end; $$;

revoke all on function public.create_order(jsonb) from public,anon;
grant execute on function public.create_order(jsonb) to authenticated;
revoke all on function public.claim_webhook_event(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_webhook_event(text,text,jsonb) to service_role;
revoke all on function public.transition_order_status(uuid,text) from public,anon;
grant execute on function public.transition_order_status(uuid,text) to authenticated;
revoke all on function public.create_pos_order(jsonb) from public,anon;
grant execute on function public.create_pos_order(jsonb) to authenticated;
