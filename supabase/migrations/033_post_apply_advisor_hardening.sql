-- Pós-aplicação das migrations de entrada/consignação e pós-venda.
-- Fecha execução anônima dos helpers de autorização e cobre as novas FKs apontadas pelo Advisor.

create index if not exists consignors_created_by_idx
  on public.consignors(created_by);

create index if not exists consignment_settlements_intake_item_id_idx
  on public.consignment_settlements(intake_item_id);

create index if not exists consignment_settlements_product_id_idx
  on public.consignment_settlements(product_id);

create index if not exists consignment_settlements_financial_entry_id_idx
  on public.consignment_settlements(financial_entry_id);

-- Helpers de autorização são usados internamente por policies/RPCs autenticadas.
-- Visitantes anônimos não precisam chamá-los diretamente via Data API.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.has_system_role(text[]) from anon;

grant execute on function public.is_admin() to authenticated,service_role;
grant execute on function public.has_system_role(text[]) to authenticated,service_role;
