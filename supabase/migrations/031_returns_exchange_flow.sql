-- Pós-venda operacional: trocas/devoluções com retorno de estoque e confirmação manual de reembolso.
-- Não executa estorno no gateway. O status de reembolso só é concluído quando a equipe confirma o pagamento externo.

create table if not exists public.order_returns(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  customer_id uuid not null references public.profiles(id),
  resolution text not null check(resolution in('refund','exchange')),
  reason text not null,
  status text not null default 'requested' check(status in('requested','approved','received','completed','rejected')),
  refund_amount numeric(10,2) not null default 0 check(refund_amount>=0),
  refund_status text not null default 'pending' check(refund_status in('not_required','pending','completed','failed')),
  refund_reference text,
  notes text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id)
);

create table if not exists public.order_return_items(
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.order_returns(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id),
  product_id uuid references public.products(id),
  quantity integer not null check(quantity>0),
  unit_price numeric(10,2) not null check(unit_price>=0),
  restocked boolean not null default false,
  status text not null default 'pending' check(status in('pending','received','rejected')),
  created_at timestamptz not null default now(),
  unique(return_id,order_item_id)
);

create index if not exists order_returns_order_id_idx on public.order_returns(order_id);
create index if not exists order_returns_customer_id_idx on public.order_returns(customer_id);
create index if not exists order_returns_created_by_idx on public.order_returns(created_by);
create index if not exists order_returns_status_idx on public.order_returns(status,requested_at desc);
create index if not exists order_return_items_return_id_idx on public.order_return_items(return_id);
create index if not exists order_return_items_order_item_id_idx on public.order_return_items(order_item_id);
create index if not exists order_return_items_product_id_idx on public.order_return_items(product_id);

alter table public.order_returns enable row level security;
alter table public.order_return_items enable row level security;

drop policy if exists "gestao gerencia devolucoes" on public.order_returns;
create policy "gestao gerencia devolucoes" on public.order_returns
  for all to authenticated
  using (has_system_role(array['admin','manager']))
  with check (has_system_role(array['admin','manager']));

drop policy if exists "gestao gerencia itens devolucao" on public.order_return_items;
create policy "gestao gerencia itens devolucao" on public.order_return_items
  for all to authenticated
  using (has_system_role(array['admin','manager']))
  with check (has_system_role(array['admin','manager']));

revoke all on table public.order_returns,public.order_return_items from anon;
grant select,insert,update on table public.order_returns,public.order_return_items to authenticated;
grant select,insert,update,delete on table public.order_returns,public.order_return_items to service_role;

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
    total_refund:=total_refund+(source_item.unit_price*requested.quantity);
  end loop;

  insert into public.order_returns(order_id,customer_id,resolution,reason,status,refund_amount,refund_status,approved_at)
  values(
    target_order.id,target_order.customer_id,p_resolution,trim(p_reason),'approved',
    round(total_refund,2),case when p_resolution='refund' then 'pending' else 'not_required' end,now()
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

create or replace function public.receive_order_return(p_return_id uuid,p_restock boolean default true)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.order_returns%rowtype;
  item record;
begin
  if not has_system_role(array['admin','manager','inventory']) then
    raise exception 'Conta sem permissão para receber devoluções';
  end if;

  select * into target from public.order_returns where id=p_return_id for update;
  if target.id is null then raise exception 'Devolução não encontrada'; end if;
  if target.status not in('approved','requested') then return target.id; end if;

  -- Uma venda consignada devolvida não pode manter repasse financeiro em aberto.
  -- Se o repasse já saiu, a equipe precisa regularizar antes de receber a peça para
  -- evitar devolver estoque e manter um pagamento irreversivelmente marcado como quitado.
  if exists(
    select 1
      from public.order_return_items ri
      join public.consignment_settlements cs on cs.order_item_id=ri.order_item_id
     where ri.return_id=target.id
       and cs.status='paid'
  ) then
    raise exception 'Há repasse de consignação já pago nesta devolução. Regularize o repasse antes de receber a peça';
  end if;

  update public.consignment_settlements cs
     set status='cancelled'
    from public.order_return_items ri
   where ri.return_id=target.id
     and ri.order_item_id=cs.order_item_id
     and cs.status='pending';

  for item in select * from public.order_return_items where return_id=target.id and status='pending' for update
  loop
    if p_restock and item.product_id is not null then
      update public.products set stock=stock+item.quantity,active=true,updated_at=now() where id=item.product_id;
    end if;
    update public.order_return_items
       set status='received',restocked=(p_restock and item.product_id is not null)
     where id=item.id;
  end loop;

  update public.order_returns
     set status=case when resolution='exchange' then 'completed' else 'received' end,
         received_at=now(),
         completed_at=case when resolution='exchange' then now() else completed_at end
   where id=target.id;

  return target.id;
end;
$$;

revoke all on function public.receive_order_return(uuid,boolean) from public,anon;
grant execute on function public.receive_order_return(uuid,boolean) to authenticated,service_role;

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
     where category='Reembolso de venda' and description like '%'||target.id::text||'%'
     order by created_at desc limit 1;
    return entry_id;
  end if;

  insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
  values(
    'expense','Reembolso de venda','Devolução '||target.id::text,
    target.refund_amount,current_date,now(),'paid'
  ) returning id into entry_id;

  update public.order_returns
     set refund_status='completed',refund_reference=nullif(trim(coalesce(p_reference,'')),''),
         status='completed',completed_at=now()
   where id=target.id;

  return entry_id;
end;
$$;

revoke all on function public.confirm_manual_order_refund(uuid,text) from public,anon;
grant execute on function public.confirm_manual_order_refund(uuid,text) to authenticated,service_role;
