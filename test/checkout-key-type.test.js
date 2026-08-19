import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/025_checkout_key_type.sql', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../pages/admin.jsx', import.meta.url), 'utf8');

test('checkout compara checkout_key textual com variável textual', () => {
  assert.match(migration, /request_key text;/);
  assert.doesNotMatch(migration, /request_key:=.*::uuid/);
  assert.match(migration, /checkout_key=request_key/);
});

test('checkout valida formato sem converter a coluna text para uuid', () => {
  assert.match(migration, /request_key !~\*/);
  assert.match(migration, /Identificador de checkout inválido/);
});

test('sidebar organiza módulos em grupos recolhíveis', () => {
  for (const group of ['VISÃO GERAL','COMERCIAL','RELACIONAMENTO','OPERAÇÃO','ADMINISTRAÇÃO']) assert.match(admin, new RegExp(group));
  assert.match(admin, /<details/);
  assert.match(admin, /<summary>/);
});
