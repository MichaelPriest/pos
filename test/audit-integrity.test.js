import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/024_audit_composite_keys.sql', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../pages/admin.jsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/SystemLayout.jsx', import.meta.url), 'utf8');

test('auditoria não presume que todo registro possui campo id', () => {
  assert.doesNotMatch(migration, /new\.id|old\.id/i);
  assert.match(migration, /after_row->>'profile_id'/);
  assert.match(migration, /before_row->>'profile_id'/);
});

test('auditoria retorna o registro correto em exclusões e alterações', () => {
  assert.match(migration, /if tg_op='DELETE' then return old;/);
  assert.match(migration, /return new;/);
});

test('painel usa somente a navegação lateral, sem abas duplicadas', () => {
  assert.doesNotMatch(admin, /admin-module-tabs/);
  assert.doesNotMatch(admin, /className="admin-side"/);
  assert.match(layout, /system-sidebar/);
});
