import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/042_private_shipping_settings.sql',import.meta.url),'utf8');
const api=await readFile(new URL('../api/admin/shipping-settings.js',import.meta.url),'utf8');
const melhor=await readFile(new URL('../api/shipping/melhor-envio.js',import.meta.url),'utf8');
const checkout=await readFile(new URL('../api/shipping/checkout-quotes.js',import.meta.url),'utf8');
const health=await readFile(new URL('../api/health.js',import.meta.url),'utf8');
const hub=await readFile(new URL('../components/IntegrationHub.jsx',import.meta.url),'utf8');
const admin=await readFile(new URL('../pages/admin.jsx',import.meta.url),'utf8');

test('configuração fiscal e endereço do remetente saem de store_settings pública',()=>{
  assert.match(migration,/create table if not exists public\.shipping_settings/i);
  assert.match(migration,/alter table public\.shipping_settings enable row level security/i);
  assert.match(migration,/revoke all on table public\.shipping_settings from public,anon,authenticated/i);
  assert.match(migration,/grant select,insert,update,delete on table public\.shipping_settings to service_role/i);
  assert.match(migration,/drop column if exists shipping_origin_company_document/i);
  assert.match(migration,/drop column if exists shipping_origin_state_register/i);
  assert.match(migration,/drop column if exists shipping_origin_street/i);
});

test('API administrativa exige admin e usa service role',()=>{
  assert.ok(api.includes("profiles[0]?.role!=='admin'"));
  assert.ok(api.includes('/rest/v1/shipping_settings'));
  assert.ok(api.includes("Authorization:'Bearer '+service"));
  assert.ok(api.includes("scope:'admin-shipping-settings'"));
});

test('frontoffice não lê configuração sensível pela store_settings pública',()=>{
  assert.ok(melhor.includes('/rest/v1/shipping_settings'));
  assert.ok(checkout.includes('/rest/v1/shipping_settings'));
  assert.doesNotMatch(health,/store_settings\?id=eq\.1&select=[^\n]*shipping_origin_/i);
});

test('Central de Integrações usa estado privado separado',()=>{
  assert.ok(hub.includes('shippingSettings'));
  assert.ok(hub.includes('saveShippingSettings'));
  assert.ok(admin.includes("fetch('/api/admin/shipping-settings'"));
  assert.ok(admin.includes('setShippingSettings'));
  assert.ok(admin.includes('saveShippingSettings'));
});
