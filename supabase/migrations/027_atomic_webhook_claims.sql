-- Processamento atômico de webhooks com retomada de workers interrompidos.
alter table public.webhook_events add column if not exists locked_at timestamptz not null default now();
alter table public.webhook_events add column if not exists claim_token uuid;

create or replace function public.claim_webhook_event(p_provider text,p_event_id text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare token uuid:=gen_random_uuid();claimed uuid;
begin
  if nullif(trim(p_provider),'') is null or nullif(trim(p_event_id),'') is null then return null; end if;
  insert into webhook_events(provider,event_id,payload,status,attempts,last_error,locked_at,claim_token)
  values(trim(p_provider),trim(p_event_id),coalesce(p_payload,'{}'::jsonb),'processing',1,null,now(),token)
  on conflict(provider,event_id) do update set
    payload=excluded.payload,status='processing',attempts=webhook_events.attempts+1,last_error=null,locked_at=now(),claim_token=token
  where webhook_events.status='failed'
     or (webhook_events.status='processing' and webhook_events.locked_at<now()-interval '5 minutes')
  returning webhook_events.claim_token into claimed;
  return claimed;
end;$$;

create or replace function public.finish_webhook_event(p_provider text,p_event_id text,p_claim_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  update webhook_events set status=case when p_success then 'processed' else 'failed' end,
    processed_at=case when p_success then now() else null end,
    last_error=case when p_success then null else left(coalesce(p_error,'Erro desconhecido'),1000) end
  where provider=p_provider and event_id=p_event_id and status='processing' and claim_token=p_claim_token;
  get diagnostics changed=row_count;
  return changed=1;
end;$$;

revoke all on function public.claim_webhook_event(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_webhook_event(text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_webhook_event(text,text,jsonb) to service_role;
grant execute on function public.finish_webhook_event(text,text,uuid,boolean,text) to service_role;
