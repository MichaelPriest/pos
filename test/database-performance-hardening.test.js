import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/029_database_performance_hardening.sql',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('adiciona índices para todas as FKs sem cobertura encontradas na auditoria',()=>{
  const expected=[
    'cash_movements_operator_id_idx','cash_movements_order_id_idx','cash_movements_session_id_idx',
    'coupons_created_by_idx','customer_favorites_product_id_idx','customer_notifications_order_id_idx',
    'donations_donor_id_idx','financial_entries_created_by_idx','integration_secrets_updated_by_idx',
    'order_items_order_id_idx','order_items_product_id_idx','time_entries_employee_id_idx',
    'tracking_events_created_by_idx','tracking_events_order_id_idx'
  ];
  for(const name of expected) assert.ok(migration.includes(`create index if not exists ${name}`),name);
});

test('RLS usa auth.uid como initplan estável nas políticas auditadas',()=>{
  assert.ok(migration.includes('(select auth.uid())'));
  assert.doesNotMatch(migration,/= auth\.uid\(\)/);
  assert.match(migration,/alter policy "cliente gerencia favoritos"[\s\S]*with check \(customer_id = \(select auth\.uid\(\)\)\)/i);
});

test('schema de instalação nova recebe a otimização auditada',()=>{
  assert.match(schema,/AUDIT-PERFORMANCE-2026-10/);
  assert.match(schema,/create index if not exists order_items_order_id_idx/i);
  assert.match(schema,/alter policy "cliente ve pedidos"[\s\S]*\(select auth\.uid\(\)\)/i);
});
