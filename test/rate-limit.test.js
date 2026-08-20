import assert from 'node:assert/strict';
import test from 'node:test';
import { clientAddress, rateLimitKey } from '../lib/server/rate-limit.js';

test('normaliza o primeiro IP encaminhado e não o armazena em texto aberto',()=>{
  const req={headers:{'x-forwarded-for':'203.0.113.10, 10.0.0.1'},socket:{}};
  assert.equal(clientAddress(req),'203.0.113.10');
  const key=rateLimitKey('payment-create',req);
  assert.equal(key.length,64);
  assert.equal(key.includes('203.0.113.10'),false);
  assert.notEqual(key,rateLimitKey('payment-status',req));
});
