import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { providers } from '../api/admin/payment-settings.js';

const hub=readFileSync(new URL('../components/IntegrationHub.jsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../pages/admin.jsx',import.meta.url),'utf8');

test('central de integrações cobre pagamentos, marketplaces, marketing e logística',()=>{
  for(const provider of providers) assert.match(hub,new RegExp(`['"]${provider}['"]`));
  assert.match(admin,/tab==='Integrações'/);
  assert.match(hub,/Canais públicos/);
});

test('credenciais permanecem protegidas e nunca são renderizadas',()=>{
  assert.doesNotMatch(hub,/encrypted_value|secret\.value/);
  assert.match(hub,/type="password"/);
  assert.match(hub,/criptografadas no servidor/);
});
