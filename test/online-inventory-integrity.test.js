import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/023_online_inventory_integrity.sql', import.meta.url), 'utf8');

test('checkout online soma itens repetidos antes de reservar estoque', () => {
  const aggregations = migration.match(/sum\(\(item->>'quantity'\)::int\)/g) ?? [];
  assert.ok(aggregations.length >= 2);
  assert.match(migration, /stock < requested\.quantity/);
  assert.match(migration, /stock=stock-requested\.quantity/);
});

test('checkout mantém idempotência sem ocultar outras violações únicas', () => {
  assert.match(migration, /if request_key is null then raise;/);
  assert.match(migration, /if new_id is null then raise;/);
});

test('uso do cupom só é contabilizado depois da criação do pedido', () => {
  const orderPosition = migration.indexOf('insert into orders');
  const couponPosition = migration.lastIndexOf('update coupons set used_count=used_count+1');
  assert.ok(orderPosition > 0 && couponPosition > orderPosition);
});
