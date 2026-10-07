-- RLS explícito por papel e privilégios padrão seguros para novos objetos.
-- Consolida policies permissivas sobrepostas sem ampliar o acesso existente.

-- Novos objetos deixam de nascer expostos ao cliente por padrão.
alter default privileges for role postgres in schema public
  revoke select,insert,update,delete on tables from anon,authenticated;
alter default privileges for role postgres in schema public
  revoke usage,select on sequences from anon,authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public,anon,authenticated;

-- Catálogo: visitante vê ativo; equipe também pode ver inativo.
drop policy if exists "catalogo publico" on public.products;
drop policy if exists "equipe consulta produtos" on public.products;
create policy "catalogo ou equipe consulta produtos" on public.products
  for select to anon,authenticated
  using (active=true or has_system_role(array['admin','manager','cashier','inventory']));

drop policy if exists "admin cadastra produtos" on public.products;
create policy "admin cadastra produtos" on public.products
  for insert to authenticated with check(is_admin());
drop policy if exists "admin atualiza produtos" on public.products;
create policy "admin atualiza produtos" on public.products
  for update to authenticated using(is_admin()) with check(is_admin());
drop policy if exists "admin exclui produtos" on public.products;
create policy "admin exclui produtos" on public.products
  for delete to authenticated using(is_admin());

-- Pedidos e itens: uma única policy de leitura por tabela.
drop policy if exists "cliente ve pedidos" on public.orders;
drop policy if exists "gerencia consulta pedidos" on public.orders;
create policy "cliente ou equipe ve pedidos" on public.orders
  for select to authenticated
  using ((customer_id=(select auth.uid())) or has_system_role(array['admin','manager','cashier']));

drop policy if exists "admin atualiza pedidos" on public.orders;
create policy "admin atualiza pedidos" on public.orders
  for update to authenticated using(is_admin()) with check(is_admin());

drop policy if exists "cliente ve itens" on public.order_items;
drop policy if exists "gerencia consulta itens" on public.order_items;
create policy "cliente ou equipe ve itens" on public.order_items
  for select to authenticated
  using (
    exists(
      select 1 from public.orders
      where orders.id=order_items.order_id
        and ((orders.customer_id=(select auth.uid())) or has_system_role(array['admin','manager','cashier']))
    )
  );

-- Perfis: próprio perfil ou gestão.
drop policy if exists "perfil proprio" on public.profiles;
drop policy if exists "gerencia consulta perfis" on public.profiles;
create policy "proprio ou gestao consulta perfis" on public.profiles
  for select to authenticated
  using ((id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "admin gerencia perfis" on public.profiles;
create policy "admin gerencia perfis" on public.profiles
  for update to authenticated using(is_admin()) with check(is_admin());

-- Doações: somente usuário autenticado e gestão.
drop policy if exists "cliente acompanha doacao" on public.donations;
drop policy if exists "gerencia consulta doacoes" on public.donations;
create policy "cliente ou gestao consulta doacoes" on public.donations
  for select to authenticated
  using ((donor_id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "cliente cria doacao" on public.donations;
create policy "cliente cria doacao" on public.donations
  for insert to authenticated with check(donor_id=(select auth.uid()));
drop policy if exists "admin gerencia doacao" on public.donations;
create policy "admin gerencia doacao" on public.donations
  for update to authenticated using(is_admin()) with check(is_admin());

-- Endereços e módulos operacionais nunca precisam da role anon.
drop policy if exists "cliente ve enderecos" on public.customer_addresses;
create policy "cliente ve enderecos" on public.customer_addresses
  for select to authenticated using(customer_id=(select auth.uid()));
drop policy if exists "cliente cria enderecos" on public.customer_addresses;
create policy "cliente cria enderecos" on public.customer_addresses
  for insert to authenticated
  with check (
    customer_id=(select auth.uid())
    and exists(select 1 from public.profiles where id=(select auth.uid()) and role='customer'::user_role)
  );
drop policy if exists "cliente exclui enderecos" on public.customer_addresses;
create policy "cliente exclui enderecos" on public.customer_addresses
  for delete to authenticated using(customer_id=(select auth.uid()));

drop policy if exists "equipe ve caixas" on public.cash_sessions;
create policy "equipe ve caixas" on public.cash_sessions
  for select to authenticated
  using ((operator_id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "equipe ve movimentos" on public.cash_movements;
create policy "equipe ve movimentos" on public.cash_movements
  for select to authenticated
  using ((operator_id=(select auth.uid())) or has_system_role(array['admin','manager']));

drop policy if exists "gestao financeiro" on public.financial_entries;
create policy "gestao financeiro" on public.financial_entries
  for all to authenticated
  using (has_system_role(array['admin','manager']))
  with check (has_system_role(array['admin','manager']));

drop policy if exists "admin consulta auditoria" on public.audit_logs;
create policy "admin consulta auditoria" on public.audit_logs
  for select to authenticated using(has_system_role(array['admin']));

-- RH: leitura própria ou gestão; escrita exclusivamente gestão, sem policy ALL sobrepondo SELECT.
drop policy if exists "admin gerencia rh" on public.employee_details;
drop policy if exists "gestao ve rh" on public.employee_details;
create policy "equipe ve rh" on public.employee_details
  for select to authenticated
  using ((profile_id=(select auth.uid())) or has_system_role(array['admin','manager']));
create policy "gestao cria rh" on public.employee_details
  for insert to authenticated with check(has_system_role(array['admin','manager']));
create policy "gestao atualiza rh" on public.employee_details
  for update to authenticated using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "gestao exclui rh" on public.employee_details
  for delete to authenticated using(has_system_role(array['admin','manager']));

-- Ponto: funcionário lê o próprio; gestão corrige.
drop policy if exists "equipe ve ponto" on public.time_entries;
drop policy if exists "gestao corrige ponto" on public.time_entries;
create policy "equipe ve ponto" on public.time_entries
  for select to authenticated
  using ((employee_id=(select auth.uid())) or has_system_role(array['admin','manager']));
create policy "gestao cria ponto" on public.time_entries
  for insert to authenticated with check(has_system_role(array['admin','manager']));
create policy "gestao atualiza ponto" on public.time_entries
  for update to authenticated using(has_system_role(array['admin','manager'])) with check(has_system_role(array['admin','manager']));
create policy "gestao exclui ponto" on public.time_entries
  for delete to authenticated using(has_system_role(array['admin','manager']));

drop policy if exists "cliente ve rastreio" on public.tracking_events;
create policy "cliente ve rastreio" on public.tracking_events
  for select to authenticated
  using (
    exists(
      select 1 from public.orders
      where orders.id=tracking_events.order_id
        and ((orders.customer_id=(select auth.uid())) or has_system_role(array['admin','manager']))
    )
  );
drop policy if exists "equipe registra rastreio" on public.tracking_events;
create policy "equipe registra rastreio" on public.tracking_events
  for insert to authenticated with check(has_system_role(array['admin','manager']));

-- Configuração pública continua pública; alteração fica autenticada/admin.
drop policy if exists "configuracao publica" on public.store_settings;
create policy "configuracao publica" on public.store_settings
  for select to anon,authenticated using(true);
drop policy if exists "admin personaliza loja" on public.store_settings;
create policy "admin personaliza loja" on public.store_settings
  for update to authenticated using(is_admin()) with check(is_admin());

-- Cupons: leitura e escrita administrativas; validação do cliente continua pela RPC validate_coupon.
drop policy if exists "admin consulta cupons" on public.coupons;
create policy "admin consulta cupons" on public.coupons
  for select to authenticated using(is_admin());
drop policy if exists "admin cria cupons" on public.coupons;
create policy "admin cria cupons" on public.coupons
  for insert to authenticated with check(is_admin());
drop policy if exists "admin atualiza cupons" on public.coupons;
create policy "admin atualiza cupons" on public.coupons
  for update to authenticated using(is_admin()) with check(is_admin());
drop policy if exists "admin exclui cupons" on public.coupons;
create policy "admin exclui cupons" on public.coupons
  for delete to authenticated using(is_admin());
