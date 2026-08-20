-- Central de notificações transacionais da conta do cliente.
create table if not exists public.customer_notifications(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  type text not null default 'order',
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists customer_notifications_feed_idx on public.customer_notifications(customer_id,created_at desc);
alter table public.customer_notifications enable row level security;
drop policy if exists "cliente consulta notificacoes" on public.customer_notifications;
create policy "cliente consulta notificacoes" on public.customer_notifications for select to authenticated using(customer_id=auth.uid());
grant select on public.customer_notifications to authenticated;

create or replace function public.notify_order_status()returns trigger language plpgsql security definer set search_path=public as $$declare notification_title text;notification_message text;begin if new.status=old.status then return new;end if;notification_title:=case new.status when'pago'then'Pagamento confirmado'when'separando'then'Pedido em separação'when'enviado'then'Pedido enviado'when'concluido'then'Pedido entregue'when'cancelado'then'Pedido cancelado'else'Pedido atualizado'end;notification_message:=case new.status when'pago'then'Recebemos seu pagamento e a compra foi confirmada.'when'separando'then'Suas peças estão sendo preparadas para envio.'when'enviado'then'Seu pedido saiu para a transportadora. Consulte o rastreio.'when'concluido'then'Entrega concluída. Obrigado por escolher moda circular!'when'cancelado'then'O pedido foi cancelado. Consulte os detalhes na sua conta.'else'O status do pedido foi atualizado.'end;insert into customer_notifications(customer_id,order_id,type,title,message)values(new.customer_id,new.id,'order',notification_title,notification_message);return new;end;$$;
drop trigger if exists notify_order_status_change on public.orders;
create trigger notify_order_status_change after update of status on public.orders for each row execute function public.notify_order_status();

create or replace function public.notify_tracking_event()returns trigger language plpgsql security definer set search_path=public as $$declare owner_id uuid;begin select customer_id into owner_id from orders where id=new.order_id;if owner_id is not null then insert into customer_notifications(customer_id,order_id,type,title,message)values(owner_id,new.order_id,'tracking','Nova atualização de entrega',coalesce(new.description,'O transporte do seu pedido foi atualizado.'));end if;return new;end;$$;
drop trigger if exists notify_new_tracking_event on public.tracking_events;
create trigger notify_new_tracking_event after insert on public.tracking_events for each row execute function public.notify_tracking_event();

create or replace function public.mark_my_notifications_read(p_id uuid default null)returns integer language plpgsql security definer set search_path=public as $$declare changed integer;begin update customer_notifications set read_at=now()where customer_id=auth.uid()and read_at is null and(p_id is null or id=p_id);get diagnostics changed=row_count;return changed;end;$$;
revoke all on function public.mark_my_notifications_read(uuid)from public,anon;grant execute on function public.mark_my_notifications_read(uuid)to authenticated;
