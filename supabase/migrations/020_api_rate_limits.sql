-- Rate limit atômico e persistente para funções serverless distribuídas.
create table if not exists public.api_rate_limits(
  key_hash text primary key,
  hits integer not null default 0,
  reset_at timestamptz not null
);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public,anon,authenticated;

create or replace function public.consume_api_rate_limit(p_key text,p_limit integer,p_window_seconds integer)returns jsonb language plpgsql security definer set search_path=public as $$declare current_row api_rate_limits%rowtype;safe_limit integer:=greatest(1,least(coalesce(p_limit,20),1000));safe_window integer:=greatest(1,least(coalesce(p_window_seconds,60),86400));begin if random()<0.02 then delete from api_rate_limits where reset_at<now()-interval'1 day';end if;insert into api_rate_limits(key_hash,hits,reset_at)values(p_key,1,now()+make_interval(secs=>safe_window))on conflict(key_hash)do update set hits=case when api_rate_limits.reset_at<=now()then 1 else api_rate_limits.hits+1 end,reset_at=case when api_rate_limits.reset_at<=now()then now()+make_interval(secs=>safe_window)else api_rate_limits.reset_at end returning*into current_row;return jsonb_build_object('allowed',current_row.hits<=safe_limit,'hits',current_row.hits,'retry_after',greatest(1,ceil(extract(epoch from(current_row.reset_at-now())))::integer));end;$$;
revoke all on function public.consume_api_rate_limit(text,integer,integer)from public,anon,authenticated;grant execute on function public.consume_api_rate_limit(text,integer,integer)to service_role;
