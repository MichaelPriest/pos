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
