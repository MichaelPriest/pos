import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/032_rls_policy_scope.sql',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('novos objetos não nascem expostos ao cliente por default',()=>{
  assert.match(migration,/alter default privileges for role postgres in schema public[\s\S]*revoke select,insert,update,delete on tables from anon,authenticated/i);
  assert.match(migration,/revoke execute on functions from public,anon,authenticated/i);
});

test('policies principais deixam de usar role public indiscriminadamente',()=>{
  assert.match(migration,/create policy "catalogo ou equipe consulta produtos"[\s\S]*for select to anon,authenticated/i);
  assert.match(migration,/create policy "cliente ou equipe ve pedidos"[\s\S]*for select to authenticated/i);
  assert.match(migration,/create policy "proprio ou gestao consulta perfis"[\s\S]*for select to authenticated/i);
  assert.match(migration,/create policy "cliente ou gestao consulta doacoes"[\s\S]*for select to authenticated/i);
});

test('policies de leitura duplicadas são consolidadas',()=>{
  assert.match(migration,/drop policy if exists "catalogo publico"/i);
  assert.match(migration,/drop policy if exists "equipe consulta produtos"/i);
  assert.match(migration,/drop policy if exists "cliente ve pedidos"/i);
  assert.match(migration,/drop policy if exists "gerencia consulta pedidos"/i);
  assert.match(migration,/drop policy if exists "cliente ve itens"/i);
  assert.match(migration,/drop policy if exists "gerencia consulta itens"/i);
});

test('RLS mantém initplan estável para auth uid',()=>{
  assert.match(migration,/\(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration,/=auth\.uid\(\)/);
});

test('schema base inclui o escopo RLS auditado',()=>{
  assert.match(schema,/AUDIT-RLS-SCOPE-2026-10/);
  assert.match(schema,/create policy "catalogo ou equipe consulta produtos"/i);
});
