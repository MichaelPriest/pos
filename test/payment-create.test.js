import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrderId } from '../api/payments/create.js';

const id = '7efb8f88-f39d-4729-9378-9a562f72e70e';

test('normaliza os formatos retornados pelo RPC do Supabase', () => {
  assert.equal(normalizeOrderId(id), id);
  assert.equal(normalizeOrderId(`"${id}"`), id);
  assert.equal(normalizeOrderId([id]), id);
  assert.equal(normalizeOrderId([{ id }]), id);
  assert.equal(normalizeOrderId({ id }), id);
});

test('rejeita identificador de pedido ausente ou inválido', () => {
  assert.equal(normalizeOrderId(), '');
  assert.equal(normalizeOrderId({}), '');
});
