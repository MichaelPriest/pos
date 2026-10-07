import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/028_live_security_hardening.sql',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('cofre de integrações não fica exposto ao Data API do cliente',()=>{
  assert.match(migration,/revoke all on table public\.integration_secrets from public,anon,authenticated/i);
  assert.match(migration,/grant select,insert,update,delete on table public\.integration_secrets to service_role/i);
});

test('cupons ativos não podem ser enumerados por visitantes',()=>{
  assert.match(migration,/drop policy if exists "cupons publicos ativos" on public\.coupons/i);
  assert.match(migration,/create policy "admin consulta cupons"[\s\S]*for select to authenticated[\s\S]*using \(is_admin\(\)\)/i);
  assert.match(migration,/revoke all on table public\.coupons from anon/i);
});

test('funções internas de trigger não são RPCs públicas',()=>{
  for(const name of ['handle_new_user','notify_order_status','notify_tracking_event','write_audit_log','rls_auto_enable']){
    assert.match(migration,new RegExp(`revoke execute on function public\\.${name}\\\\\\(\\\\\\) from public,anon,authenticated`,'i'));
  }
});

test('schema de instalação nova inclui o endurecimento auditado',()=>{
  assert.match(schema,/AUDIT-HARDENING-2026-10/);
  assert.match(schema,/revoke all on table public\.integration_secrets from public,anon,authenticated/i);
});
