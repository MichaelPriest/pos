import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/022_cash_and_inventory_integrity.sql', import.meta.url), 'utf8');

test('permite somente um caixa aberto por operador', () => {
  assert.match(migration, /unique index[\s\S]+where status = 'open'/i);
});

test('impede sangria maior que o saldo disponível', () => {
  assert.match(migration, /p_amount > available/);
  assert.match(migration, /retirada excede o saldo disponível/i);
});

test('agrupa itens repetidos antes de validar e baixar estoque no PDV', () => {
  const groupedItems = migration.match(/sum\(\(item->>'quantity'\)::int\)/g) ?? [];
  assert.ok(groupedItems.length >= 2);
  assert.match(migration, /stock < requested\.quantity/);
  assert.match(migration, /stock=stock-requested\.quantity/);
});
