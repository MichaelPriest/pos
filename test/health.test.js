import assert from 'node:assert/strict';
import test from 'node:test';
import { healthStatus } from '../api/health.js';

test('resume a saúde dos serviços sem expor credenciais',()=>{
  assert.equal(healthStatus([{ok:true},{ok:true}]),'healthy');
  assert.equal(healthStatus([{ok:true},{ok:false}]),'degraded');
  assert.equal(healthStatus([{ok:false},{ok:false}]),'unavailable');
});
