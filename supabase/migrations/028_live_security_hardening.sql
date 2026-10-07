-- Endurecimento do Data API após auditoria do banco real em 2026-10.
-- Mantém RPCs de negócio autenticadas e fecha superfícies que não devem ser chamadas diretamente.

-- O cofre é exclusivamente server-side. RLS sem policy já bloqueava linhas, mas removemos
-- também os grants de Data API para reduzir a superfície de ataque.
revoke all on table public.integration_secrets from public,anon,authenticated;
grant select,insert,update,delete on table public.integration_secrets to service_role;

-- Códigos de cupom não devem ser enumeráveis por visitantes.
-- Clientes validam um código conhecido pela RPC validate_coupon; a tela de gestão continua
-- usando acesso autenticado protegido por is_admin().
drop policy if exists "cupons publicos ativos" on public.coupons;
drop policy if exists "admin consulta cupons" on public.coupons;
create policy "admin consulta cupons" on public.coupons
  for select to authenticated
  using (is_admin());

revoke all on table public.coupons from anon;
grant select,insert,update,delete on table public.coupons to authenticated;
grant select,insert,update,delete on table public.coupons to service_role;

-- Funções internas de trigger/event-trigger não são endpoints RPC.
-- Os triggers continuam executando pelo mecanismo do Postgres; usuários da API não precisam
-- de EXECUTE direto nelas.
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.notify_order_status() from public,anon,authenticated;
revoke execute on function public.notify_tracking_event() from public,anon,authenticated;
revoke execute on function public.write_audit_log() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
