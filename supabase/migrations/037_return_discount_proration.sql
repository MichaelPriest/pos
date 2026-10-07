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
