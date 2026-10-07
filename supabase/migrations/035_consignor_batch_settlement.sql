-- Fechamento consolidado de repasses por consignante.
-- Agrupa todos os repasses liberados em um único lançamento financeiro e baixa atômica.

create index if not exists consignment_settlements_consignor_status_available_idx
  on public.consignment_settlements(consignor_id,status,available_at);

create or replace function public.pay_consignor_settlements(
  p_consignor_id uuid,
  p_payment_reference text default null
)
returns table(financial_entry_id uuid, settlements_count integer, total_amount numeric)
language plpgsql
security definer
set search_path=public
as $$
declare
  owner_name text;
  total numeric(10,2);
  qty integer;
  entry_id uuid;
begin
  if not has_system_role(array['admin','manager']) then
    raise exception 'Conta sem permissão para registrar repasses';
  end if;

  select name into owner_name
    from public.consignors
   where id=p_consignor_id and active=true;

  if owner_name is null then
    raise exception 'Consignante não encontrado ou inativo';
  end if;

  -- O FOR UPDATE garante que duas baixas simultâneas não paguem o mesmo repasse.
  with locked as (
    select id,payout_amount
      from public.consignment_settlements
     where consignor_id=p_consignor_id
       and status='pending'
       and available_at<=now()
     order by id
     for update
  )
  select coalesce(sum(payout_amount),0),count(*)::integer
    into total,qty
    from locked;

  if qty=0 or total<=0 then
    raise exception 'Nenhum repasse liberado para este consignante';
  end if;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values(
    'expense',
    'Repasse de consignação',
    'Repasse consolidado para '||owner_name||' ('||qty||' item(ns))',
    total,current_date,now(),'paid'
  )
  returning id into entry_id;

  update public.consignment_settlements
     set status='paid',
         paid_at=now(),
         payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),
         financial_entry_id=entry_id
   where consignor_id=p_consignor_id
     and status='pending'
     and available_at<=now();

  return query select entry_id,qty,total;
end;
$$;

revoke all on function public.pay_consignor_settlements(uuid,text) from public,anon;
grant execute on function public.pay_consignor_settlements(uuid,text) to authenticated,service_role;
