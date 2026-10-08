-- Portal do cliente: solicitação de troca/devolução sem privilégios administrativos.
-- A equipe continua responsável pela aprovação, recebimento, reposição de estoque e reembolso.
drop policy if exists "cliente acompanha as proprias devolucoes" on public.order_returns;
create policy "cliente acompanha as proprias devolucoes"
on public.order_returns for select to authenticated
using (customer_id = (select auth.uid()));

drop policy if exists "cliente acompanha os itens das proprias devolucoes" on public.order_return_items;
create policy "cliente acompanha os itens das proprias devolucoes"
on public.order_return_items for select to authenticated
using (
  exists(
    select 1 from public.order_returns r
    where r.id=return_id and r.customer_id=(select auth.uid())
  )
);

create or replace function public.request_my_order_return(
  p_order_id uuid,
  p_items jsonb,
  p_reason text,
  p_resolution text
) returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  target_order public.orders%rowtype;
  requested record;
  source_item public.order_items%rowtype;
  new_return_id uuid;
  returned_subtotal numeric := 0;
  merchandise_net numeric := 0;
  refund numeric := 0;
  item_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para solicitar uma devolução';
  end if;
  if p_resolution not in ('refund','exchange') then
    raise exception 'Escolha troca ou devolução';
  end if;
  if char_length(trim(coalesce(p_reason,''))) < 10
     or char_length(trim(coalesce(p_reason,''))) > 1000 then
    raise exception 'Descreva o motivo em 10 a 1000 caracteres';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Selecione de 1 a 20 peças do pedido';
  end if;

  select * into target_order from public.orders
   where id=p_order_id and customer_id=auth.uid()
   for update;
  if target_order.id is null then
    raise exception 'Pedido não encontrado para esta conta';
  end if;
  if target_order.status not in ('pago','separando','enviado','concluido') then
    raise exception 'Somente pedidos com pagamento confirmado podem solicitar pós-venda';
  end if;

  for requested in
    select (item->>'order_item_id')::uuid as order_item_id,
           (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
  loop
    if requested.quantity is null or requested.quantity<1 then
      raise exception 'Quantidade inválida';
    end if;
    if requested.order_item_id=any(item_ids) then
      raise exception 'Selecione cada peça apenas uma vez';
    end if;
    item_ids:=array_append(item_ids,requested.order_item_id);
    select * into source_item from public.order_items
     where id=requested.order_item_id and order_id=target_order.id
     for update;
    if source_item.id is null then
      raise exception 'Peça não pertence ao seu pedido';
    end if;
    if requested.quantity>source_item.quantity then
      raise exception 'Quantidade solicitada acima da quantidade comprada';
    end if;
    if exists(
      select 1 from public.order_return_items ri
      join public.order_returns r on r.id=ri.return_id
       where ri.order_item_id=source_item.id and r.status<>'rejected'
    ) then
      raise exception 'Esta peça já possui uma solicitação de pós-venda';
    end if;
    returned_subtotal:=returned_subtotal+source_item.unit_price*requested.quantity;
  end loop;

  merchandise_net:=greatest(0,coalesce(target_order.subtotal,0)-coalesce(target_order.discount,0));
  if coalesce(target_order.subtotal,0)>0 then
    refund:=round(returned_subtotal*merchandise_net/target_order.subtotal,2);
  end if;
  refund:=least(refund,merchandise_net);
  if p_resolution='refund' and refund<=0 then
    raise exception 'Não há valor de mercadoria reembolsável';
  end if;

  insert into public.order_returns(
    order_id,customer_id,resolution,reason,status,refund_amount,refund_status,created_by
  ) values (
    target_order.id,auth.uid(),p_resolution,trim(p_reason),'requested',
    case when p_resolution='refund' then refund else 0 end,
    case when p_resolution='refund' then 'pending' else 'not_required' end,auth.uid()
  ) returning id into new_return_id;

  for requested in
    select (item->>'order_item_id')::uuid as order_item_id,
           (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
  loop
    select * into source_item from public.order_items where id=requested.order_item_id;
    insert into public.order_return_items(return_id,order_item_id,product_id,quantity,unit_price)
    values(new_return_id,source_item.id,source_item.product_id,requested.quantity,source_item.unit_price);
  end loop;

  insert into public.customer_notifications(customer_id,order_id,type,title,message)
  values(auth.uid(),target_order.id,'return','Solicitação recebida',
    'Recebemos sua solicitação de '||
    case when p_resolution='refund' then 'devolução' else 'troca' end||
    '. A equipe avaliará os próximos passos.');

  return new_return_id;
end;
$function$;

revoke all on function public.request_my_order_return(uuid,jsonb,text,text) from public,anon;
grant execute on function public.request_my_order_return(uuid,jsonb,text,text) to authenticated;
