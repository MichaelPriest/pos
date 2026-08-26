import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { healthStatus } from '../api/health.js';

test('resume a saúde dos serviços sem expor credenciais',()=>{
  assert.equal(healthStatus([{ok:true},{ok:true}]),'healthy');
  assert.equal(healthStatus([{ok:true},{ok:false}]),'degraded');
  assert.equal(healthStatus([{ok:false},{ok:false}]),'unavailable');
});

test('distingue as assinaturas de webhook sem expor os segredos',()=>{
  const source=readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
  assert.match(source,/stripe_webhook_signature/);
  assert.match(source,/mercadopago_webhook_signature/);
  assert.match(source,/stripe:Boolean\(process\.env\.STRIPE_SECRET_KEY\)/);
  assert.match(source,/mercadopago_webhook_signature:Boolean\(process\.env\.MERCADOPAGO_WEBHOOK_SECRET\)/);
  assert.doesNotMatch(source,/stripe:process\.env|mercadopago_webhook_signature:process\.env/);
});
