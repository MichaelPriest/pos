-- Reembolso automático via gateway com baixa financeira atômica.
-- A API server-side registra o resultado do provedor; clientes não executam esta RPC diretamente.

alter table public.order_returns add column if not exists refund_provider text;
alter table public.order_returns add column if not exists refund_gateway_status text;

create or replace function public.record_gateway_order_refund(
  p_return_id uuid,
  p_provider text,
  p_reference text,
  p_gateway_status text,
  p_completed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.order_returns%rowtype;
  entry_id uuid;
begin
  select * into target
    from public.order_returns
   where id=p_return_id
   for update;

  if target.id is null then raise exception 'Devolução não encontrada'; end if;
  if target.resolution<>'refund' then raise exception 'Esta operação não exige reembolso'; end if;
  if target.status not in('received','completed') then raise exception 'Receba a peça antes de processar o reembolso'; end if;

  if target.refund_status='completed' then
    select id into entry_id
      from public.financial_entries
     where category='Reembolso de venda'
       and description like 'Devolução '||target.id::text||'%'
     order by created_at desc limit 1;
    return entry_id;
  end if;

  update public.order_returns
     set refund_provider=nullif(trim(coalesce(p_provider,'')),''),
         refund_reference=nullif(trim(coalesce(p_reference,'')),''),
         refund_gateway_status=nullif(trim(coalesce(p_gateway_status,'')),''),
         refund_status=case
           when p_completed then 'completed'
           when lower(coalesce(p_gateway_status,'')) in('failed','canceled','cancelled') then 'failed'
           else 'pending'
         end,
         status=case when p_completed then 'completed' else status end,
         completed_at=case when p_completed then now() else completed_at end
   where id=target.id;

  if not p_completed then return null; end if;

  select id into entry_id
    from public.financial_entries
   where category='Reembolso de venda'
     and description like 'Devolução '||target.id::text||'%'
   order by created_at desc limit 1;

  if entry_id is null then
    insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
    values(
      'expense',
      'Reembolso de venda',
      'Devolução '||target.id::text||' · '||coalesce(nullif(trim(p_provider),''),'gateway'),
      target.refund_amount,current_date,now(),'paid'
    )
    returning id into entry_id;
  end if;

  return entry_id;
end;
$$;

revoke all on function public.record_gateway_order_refund(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_gateway_order_refund(uuid,text,text,text,boolean) to service_role;

create or replace function public.confirm_manual_order_refund(p_return_id uuid,p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.order_returns%rowtype;
  entry_id uuid;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para confirmar reembolsos';
  end if;

  select * into target from public.order_returns where id=p_return_id for update;
  if target.id is null then raise exception 'Devolução não encontrada'; end if;
  if target.resolution<>'refund' then raise exception 'Esta operação é uma troca e não exige reembolso'; end if;
  if target.status<>'received' then raise exception 'Receba a peça antes de confirmar o reembolso'; end if;
  if target.refund_status='completed' then
    select financial_entries.id into entry_id
      from public.financial_entries
     where category='Reembolso de venda' and description like 'Devolução '||target.id::text||'%'
     order by created_at desc limit 1;
    return entry_id;
  end if;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values(
    'expense','Reembolso de venda','Devolução '||target.id::text||' · manual',
    target.refund_amount,current_date,now(),'paid'
  ) returning id into entry_id;

  update public.order_returns
     set refund_status='completed',
         refund_provider='manual',
         refund_reference=nullif(trim(coalesce(p_reference,'')),''),
         refund_gateway_status='confirmed',
         status='completed',
         completed_at=now()
   where id=target.id;

  return entry_id;
end;
$$;

revoke all on function public.confirm_manual_order_refund(uuid,text) from public,anon;
grant execute on function public.confirm_manual_order_refund(uuid,text) to authenticated,service_role;
