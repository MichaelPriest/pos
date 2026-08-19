-- Segurança operacional, auditoria e idempotência de notificações externas.
create table if not exists public.webhook_events(id uuid primary key default gen_random_uuid(),provider text not null,event_id text not null,payload jsonb not null default '{}'::jsonb,status text not null default 'processing' check(status in('processing','processed','failed')),attempts integer not null default 1,last_error text,received_at timestamptz not null default now(),processed_at timestamptz,unique(provider,event_id));
create table if not exists public.audit_logs(id bigint generated always as identity primary key,actor_id uuid,action text not null,entity_type text not null,entity_id text,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
alter table webhook_events enable row level security;alter table audit_logs enable row level security;
create policy "admin consulta auditoria" on audit_logs for select using(has_system_role(array['admin']));
create or replace function public.write_audit_log()returns trigger language plpgsql security definer set search_path=public as $$begin insert into audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)values(auth.uid(),tg_op,tg_table_name,coalesce(new.id::text,old.id::text),case when tg_op in('UPDATE','DELETE')then to_jsonb(old)end,case when tg_op in('INSERT','UPDATE')then to_jsonb(new)end);return coalesce(new,old);end;$$;
drop trigger if exists audit_products on products;create trigger audit_products after insert or update or delete on products for each row execute function write_audit_log();
drop trigger if exists audit_orders on orders;create trigger audit_orders after update or delete on orders for each row execute function write_audit_log();
drop trigger if exists audit_store_settings on store_settings;create trigger audit_store_settings after update on store_settings for each row execute function write_audit_log();
drop trigger if exists audit_financial_entries on financial_entries;create trigger audit_financial_entries after insert or update or delete on financial_entries for each row execute function write_audit_log();
drop trigger if exists audit_employee_details on employee_details;create trigger audit_employee_details after insert or update or delete on employee_details for each row execute function write_audit_log();
revoke all on table webhook_events from anon,authenticated;revoke insert,update,delete on audit_logs from anon,authenticated;
-- Privilégio explícito para RPCs expostas ao aplicativo.
revoke all on function public.create_order(jsonb) from public,anon;grant execute on function public.create_order(jsonb) to authenticated;
revoke all on function public.create_pos_order(jsonb) from public,anon;grant execute on function public.create_pos_order(jsonb) to authenticated;
revoke all on function public.open_cash_session(numeric) from public,anon;grant execute on function public.open_cash_session(numeric) to authenticated;
revoke all on function public.add_cash_movement(text,numeric,text) from public,anon;grant execute on function public.add_cash_movement(text,numeric,text) to authenticated;
revoke all on function public.close_cash_session(numeric,text) from public,anon;grant execute on function public.close_cash_session(numeric,text) to authenticated;
revoke all on function public.update_my_details(text,text,text) from public,anon;grant execute on function public.update_my_details(text,text,text) to authenticated;
revoke all on function public.update_my_avatar(text) from public,anon;grant execute on function public.update_my_avatar(text) to authenticated;
revoke all on function public.save_customer_address(jsonb) from public,anon;grant execute on function public.save_customer_address(jsonb) to authenticated;
revoke all on function public.validate_coupon(text,numeric) from public,anon;grant execute on function public.validate_coupon(text,numeric) to authenticated;
revoke all on function public.toggle_time_clock(text) from public,anon;grant execute on function public.toggle_time_clock(text) to authenticated;
