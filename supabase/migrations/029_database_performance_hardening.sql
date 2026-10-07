-- Otimização do banco real após auditoria do Supabase em 2026-10.
-- Não altera regras de acesso: adiciona índices de FKs e evita reavaliar auth.uid() por linha.

-- Índices para FKs sem cobertura.
create index if not exists cash_movements_operator_id_idx on public.cash_movements(operator_id);
create index if not exists cash_movements_order_id_idx on public.cash_movements(order_id);
create index if not exists cash_movements_session_id_idx on public.cash_movements(session_id);
create index if not exists coupons_created_by_idx on public.coupons(created_by);
create index if not exists customer_favorites_product_id_idx on public.customer_favorites(product_id);
create index if not exists customer_notifications_order_id_idx on public.customer_notifications(order_id);
create index if not exists donations_donor_id_idx on public.donations(donor_id);
create index if not exists financial_entries_created_by_idx on public.financial_entries(created_by);
create index if not exists integration_secrets_updated_by_idx on public.integration_secrets(updated_by);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists time_entries_employee_id_idx on public.time_entries(employee_id);
create index if not exists tracking_events_created_by_idx on public.tracking_events(created_by);
create index if not exists tracking_events_order_id_idx on public.tracking_events(order_id);

-- Evita reavaliar auth.uid() para cada linha durante RLS.
alter policy "equipe ve movimentos" on public.cash_movements
  using ((operator_id = (select auth.uid())) or has_system_role(array['admin','manager']));

alter policy "equipe ve caixas" on public.cash_sessions
  using ((operator_id = (select auth.uid())) or has_system_role(array['admin','manager']));

alter policy "cliente cria enderecos" on public.customer_addresses
  with check (
    (customer_id = (select auth.uid()))
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'customer'::user_role
    )
  );

alter policy "cliente exclui enderecos" on public.customer_addresses
  using (customer_id = (select auth.uid()));

alter policy "cliente ve enderecos" on public.customer_addresses
  using (customer_id = (select auth.uid()));

alter policy "cliente gerencia favoritos" on public.customer_favorites
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

alter policy "cliente consulta notificacoes" on public.customer_notifications
  using (customer_id = (select auth.uid()));

alter policy "cliente acompanha doacao" on public.donations
  using ((donor_id = (select auth.uid())) or is_admin());

alter policy "cliente cria doacao" on public.donations
  with check (donor_id = (select auth.uid()));

alter policy "gestao ve rh" on public.employee_details
  using ((profile_id = (select auth.uid())) or has_system_role(array['admin','manager']));

alter policy "cliente ve itens" on public.order_items
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and ((orders.customer_id = (select auth.uid())) or is_admin())
    )
  );

alter policy "cliente ve pedidos" on public.orders
  using ((customer_id = (select auth.uid())) or is_admin());

alter policy "perfil proprio" on public.profiles
  using ((id = (select auth.uid())) or is_admin());

alter policy "equipe ve ponto" on public.time_entries
  using ((employee_id = (select auth.uid())) or has_system_role(array['admin','manager']));

alter policy "cliente ve rastreio" on public.tracking_events
  using (
    exists (
      select 1 from public.orders
      where orders.id = tracking_events.order_id
        and ((orders.customer_id = (select auth.uid())) or has_system_role(array['admin','manager']))
    )
  );
