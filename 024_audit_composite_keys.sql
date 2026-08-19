-- A auditoria suporta tabelas cuja chave primária não se chama "id", como employee_details.profile_id.
create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  before_row jsonb;
  after_row jsonb;
  record_key text;
begin
  if tg_op in ('UPDATE','DELETE') then before_row:=to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then after_row:=to_jsonb(new); end if;

  record_key:=coalesce(
    after_row->>'id', before_row->>'id',
    after_row->>'profile_id', before_row->>'profile_id',
    after_row->>'provider', before_row->>'provider'
  );

  insert into audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),tg_op,tg_table_name,record_key,before_row,after_row);

  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
