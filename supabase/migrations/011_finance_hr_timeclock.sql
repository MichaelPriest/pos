-- Financeiro, cadastro profissional e ponto eletrônico.
create table if not exists public.financial_entries(
 id uuid primary key default gen_random_uuid(),type text not null check(type in('income','expense')),category text not null,description text not null,amount numeric(12,2) not null check(amount>0),due_date date not null,paid_at timestamptz,status text not null default 'pending' check(status in('pending','paid','cancelled')),created_by uuid references profiles(id) default auth.uid(),created_at timestamptz not null default now()
);
create table if not exists public.employee_details(
 profile_id uuid primary key references profiles(id) on delete cascade,job_title text,department text default 'Loja',admission_date date,salary numeric(12,2),employment_status text not null default 'active' check(employment_status in('active','leave','terminated')),notes text,updated_at timestamptz not null default now()
);
create table if not exists public.time_entries(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references profiles(id) on delete cascade,clock_in timestamptz not null default now(),clock_out timestamptz,notes text,created_at timestamptz not null default now(),check(clock_out is null or clock_out>=clock_in)
);
alter table financial_entries enable row level security;alter table employee_details enable row level security;alter table time_entries enable row level security;
create policy "gestao financeiro" on financial_entries for all using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "gestao ve rh" on employee_details for select using(profile_id=auth.uid() or has_system_role(array['admin','manager']));
create policy "admin gerencia rh" on employee_details for all using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "equipe ve ponto" on time_entries for select using(employee_id=auth.uid() or has_system_role(array['admin','manager']));
create policy "gestao corrige ponto" on time_entries for all using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create or replace function public.toggle_time_clock(p_notes text default null) returns jsonb language plpgsql security definer set search_path=public as $$declare open_entry time_entries%rowtype;begin if not has_system_role(array['admin','manager','cashier','inventory'])then raise exception 'Conta sem acesso ao ponto';end if;select*into open_entry from time_entries where employee_id=auth.uid() and clock_out is null order by clock_in desc limit 1 for update;if open_entry.id is null then insert into time_entries(employee_id,notes)values(auth.uid(),p_notes)returning*into open_entry;return jsonb_build_object('action','clock_in','id',open_entry.id,'at',open_entry.clock_in);else update time_entries set clock_out=now(),notes=coalesce(nullif(p_notes,''),notes)where id=open_entry.id returning*into open_entry;return jsonb_build_object('action','clock_out','id',open_entry.id,'at',open_entry.clock_out);end if;end;$$;
grant execute on function public.toggle_time_clock(text) to authenticated;
