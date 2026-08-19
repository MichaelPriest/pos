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
