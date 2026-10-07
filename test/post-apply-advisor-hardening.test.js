import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/033_post_apply_advisor_hardening.sql',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('novas FKs da consignação recebem índices de cobertura',()=>{
  for(const name of [
    'consignors_created_by_idx',
    'consignment_settlements_intake_item_id_idx',
    'consignment_settlements_product_id_idx',
    'consignment_settlements_financial_entry_id_idx'
  ]) assert.ok(migration.includes(`create index if not exists ${name}`),name);
});

test('helpers de autorização deixam de ser executáveis anonimamente',()=>{
  assert.match(migration,/revoke execute on function public\.is_admin\(\) from anon/i);
  assert.match(migration,/revoke execute on function public\.has_system_role\(text\[\]\) from anon/i);
  assert.match(migration,/grant execute on function public\.is_admin\(\) to authenticated,service_role/i);
  assert.match(migration,/grant execute on function public\.has_system_role\(text\[\]\) to authenticated,service_role/i);
});

test('schema base incorpora o hardening pós-advisor',()=>{
  assert.match(schema,/AUDIT-POST-APPLY-ADVISOR-2026-10/);
  assert.match(schema,/consignment_settlements_financial_entry_id_idx/i);
});
