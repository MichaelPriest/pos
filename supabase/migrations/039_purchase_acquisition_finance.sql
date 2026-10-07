-- Integra compras próprias de peças ao financeiro.
-- O custo é reconhecido quando a peça é aprovada/publicada; doações e consignações não geram esta despesa.

alter table public.inventory_intake_items
  add column if not exists acquisition_financial_entry_id uuid
  references public.financial_entries(id) on delete set null;

create index if not exists inventory_intake_items_acquisition_financial_entry_id_idx
  on public.inventory_intake_items(acquisition_financial_entry_id);

create or replace function public.approve_intake_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  item public.inventory_intake_items%rowtype;
  intake public.inventory_intakes%rowtype;
  new_product_id uuid;
  generated_sku text;
  first_image text;
  acquisition_entry_id uuid;
begin
  if not has_system_role(array['admin','manager','inventory']) then
    raise exception 'Conta sem permissão para aprovar entradas';
  end if;

  select * into item from public.inventory_intake_items where id=p_item_id for update;
  if item.id is null then raise exception 'Peça de entrada não encontrada'; end if;
  if item.status='listed' and item.product_id is not null then return item.product_id; end if;
  if item.status<>'pending' then raise exception 'A peça não está disponível para aprovação'; end if;

  select * into intake from public.inventory_intakes where id=item.intake_id for update;
  if intake.id is null then raise exception 'Entrada não encontrada'; end if;
  if intake.source_type='consignment' and intake.consignor_id is null then
    raise exception 'Consignação exige proprietário vinculado';
  end if;

  generated_sku:='RV-'||upper(substr(replace(item.id::text,'-',''),1,10));
  if jsonb_typeof(item.images)='array' and jsonb_array_length(item.images)>0 then
    first_image:=nullif(item.images->>0,'');
  end if;

  if intake.source_type='purchase' and item.acquisition_cost>0 then
    if item.acquisition_financial_entry_id is null then
      insert into public.financial_entries(type,category,description,amount,due_date,paid_at,status)
      values(
        'expense',
        'Compra de peças',
        'Aquisição de peça · '||item.name||' · '||item.id::text,
        item.acquisition_cost,current_date,now(),'paid'
      )
      returning id into acquisition_entry_id;
    else
      acquisition_entry_id:=item.acquisition_financial_entry_id;
    end if;
  end if;

  insert into public.products(name,description,category,size,price,stock,image_url,active,sku,brand,color,condition_grade)
  values(item.name,item.description,item.category,item.size,item.sale_price,1,first_image,true,generated_sku,item.brand,item.color,item.condition_grade)
  returning id into new_product_id;

  update public.inventory_intake_items
     set product_id=new_product_id,
         status='listed',
         acquisition_financial_entry_id=coalesce(acquisition_entry_id,acquisition_financial_entry_id),
         updated_at=now()
   where id=item.id;

  if not exists(
    select 1 from public.inventory_intake_items
     where intake_id=intake.id and status='pending'
  ) then
    update public.inventory_intakes set status='approved',updated_at=now() where id=intake.id;
  end if;

  return new_product_id;
end;
$$;

revoke all on function public.approve_intake_item(uuid) from public,anon;
grant execute on function public.approve_intake_item(uuid) to authenticated,service_role;
