-- Devolução de peça consignada não vendida ao proprietário.
-- Remove a peça do catálogo/PDV e encerra o ciclo operacional sem gerar repasse.

alter table public.inventory_intake_items add column if not exists returned_at timestamptz;
alter table public.inventory_intake_items add column if not exists return_reason text;

create index if not exists inventory_intake_items_status_idx
  on public.inventory_intake_items(status,updated_at desc);

create or replace function public.return_consigned_item(
  p_item_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  item public.inventory_intake_items%rowtype;
  intake public.inventory_intakes%rowtype;
  product_stock integer;
begin
  if not has_system_role(array['admin','manager','inventory']) then
    raise exception 'Conta sem permissão para devolver peças consignadas';
  end if;

  select * into item
    from public.inventory_intake_items
   where id=p_item_id
   for update;

  if item.id is null then raise exception 'Peça não encontrada'; end if;
  if item.status='returned' then return item.id; end if;
  if item.status not in('pending','listed') then
    raise exception 'Esta peça não pode ser devolvida neste status';
  end if;

  select * into intake
    from public.inventory_intakes
   where id=item.intake_id
   for update;

  if intake.id is null or intake.source_type<>'consignment' then
    raise exception 'Somente peças consignadas podem ser devolvidas ao proprietário';
  end if;

  if item.product_id is not null then
    select stock into product_stock
      from public.products
     where id=item.product_id
     for update;

    if coalesce(product_stock,0)<=0 then
      raise exception 'A peça não está disponível em estoque para devolução';
    end if;

    update public.products
       set active=false,stock=0,updated_at=now()
     where id=item.product_id;
  end if;

  update public.inventory_intake_items
     set status='returned',
         returned_at=now(),
         return_reason=nullif(trim(coalesce(p_reason,'')),''),
         updated_at=now()
   where id=item.id;

  if not exists(
    select 1
      from public.inventory_intake_items
     where intake_id=intake.id
       and status in('pending','listed')
  ) then
    update public.inventory_intakes
       set status='closed',updated_at=now()
     where id=intake.id;
  end if;

  return item.id;
end;
$$;

revoke all on function public.return_consigned_item(uuid,text) from public,anon;
grant execute on function public.return_consigned_item(uuid,text) to authenticated,service_role;
