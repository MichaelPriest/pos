-- Endereços idempotentes: uma nova compra atualiza o endereço existente em vez de duplicá-lo.
with ranked as (
  select id,row_number() over(partition by customer_id,regexp_replace(zip_code,'\D','','g'),lower(trim(street)),lower(trim(number)),lower(trim(coalesce(complement,''))) order by is_default desc,created_at desc) position
  from public.customer_addresses
)
delete from public.customer_addresses where id in(select id from ranked where position>1);

with defaults as (
 select id,row_number() over(partition by customer_id order by created_at desc) position from public.customer_addresses where is_default=true
)
update public.customer_addresses set is_default=false where id in(select id from defaults where position>1);

create unique index if not exists customer_addresses_unique_location
on public.customer_addresses(customer_id,regexp_replace(zip_code,'\D','','g'),lower(trim(street)),lower(trim(number)),lower(trim(coalesce(complement,''))));
create unique index if not exists customer_addresses_one_default on public.customer_addresses(customer_id) where is_default=true;

create or replace function public.save_customer_address(p_address jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare address_id uuid;make_default boolean:=coalesce((p_address->>'is_default')::boolean,false);normalized_zip text:=regexp_replace(coalesce(p_address->>'zip_code',''),'\D','','g');
begin
 if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role='customer')then raise exception 'Conta de cliente necessária';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if length(normalized_zip)<>8 or nullif(trim(p_address->>'street'),'')is null or nullif(trim(p_address->>'number'),'')is null then raise exception 'Endereço incompleto';end if;
 select id into address_id from customer_addresses where customer_id=auth.uid() and regexp_replace(zip_code,'\D','','g')=normalized_zip and lower(trim(street))=lower(trim(p_address->>'street')) and lower(trim(number))=lower(trim(p_address->>'number')) and lower(trim(coalesce(complement,'')))=lower(trim(coalesce(p_address->>'complement',''))) limit 1;
 if make_default then update customer_addresses set is_default=false where customer_id=auth.uid() and is_default=true and id is distinct from address_id;end if;
 if address_id is null then
  insert into customer_addresses(customer_id,label,zip_code,street,number,complement,neighborhood,city,state,is_default)values(auth.uid(),coalesce(nullif(trim(p_address->>'label'),''),'Principal'),normalized_zip,trim(p_address->>'street'),trim(p_address->>'number'),nullif(trim(p_address->>'complement'),''),trim(p_address->>'neighborhood'),trim(p_address->>'city'),upper(trim(p_address->>'state')),make_default)returning id into address_id;
 else
  update customer_addresses set label=coalesce(nullif(trim(p_address->>'label'),''),label),zip_code=normalized_zip,street=trim(p_address->>'street'),number=trim(p_address->>'number'),complement=nullif(trim(p_address->>'complement'),''),neighborhood=trim(p_address->>'neighborhood'),city=trim(p_address->>'city'),state=upper(trim(p_address->>'state')),is_default=make_default where id=address_id;
 end if;
 return address_id;
end;$$;
grant execute on function public.save_customer_address(jsonb) to authenticated;
