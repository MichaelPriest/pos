import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/034_authorization_helper_execute_scope.sql',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('helpers de autorização revogam EXECUTE herdado de PUBLIC e anon',()=>{
  assert.match(migration,/revoke execute on function public\.is_admin\(\) from public,anon/i);
  assert.match(migration,/revoke execute on function public\.has_system_role\(text\[\]\) from public,anon/i);
});

test('helpers continuam disponíveis explicitamente para authenticated e service_role',()=>{
  assert.match(migration,/grant execute on function public\.is_admin\(\) to authenticated,service_role/i);
  assert.match(migration,/grant execute on function public\.has_system_role\(text\[\]\) to authenticated,service_role/i);
});

test('schema base inclui o escopo correto dos helpers de autorização',()=>{
  assert.match(schema,/AUDIT-AUTH-HELPER-EXECUTE-2026-10/);
  assert.match(schema,/revoke execute on function public\.is_admin\(\) from public,anon/i);
});
