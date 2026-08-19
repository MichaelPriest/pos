import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStripeCheckoutBody, normalizeOrderId } from '../api/payments/create.js';

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

test('monta checkout Stripe em português com marca, e-mail e vínculo ao pedido', () => {
  const body = buildStripeCheckoutBody({ id, total: 49.9 }, 'https://loja.test', 'cliente@example.com', { store_name: 'Brechó das Amigas' });
  assert.equal(body.get('locale'), 'pt-BR');
  assert.equal(body.get('customer_email'), 'cliente@example.com');
  assert.equal(body.get('payment_method_types[0]'), 'card');
  assert.equal(body.get('payment_intent_data[metadata][order_id]'), id);
  assert.equal(body.get('line_items[0][price_data][product_data][name]'), 'Brechó das Amigas · Pedido #7EFB8F88');
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '4990');
  assert.ok(Number(body.get('expires_at')) > Math.floor(Date.now()/1000));
  assert.match(body.get('success_url'), new RegExp(`pedido=${id}.*session_id=\\{CHECKOUT_SESSION_ID\\}`));
  assert.match(body.get('cancel_url'), /\/checkout\?pagamento=cancelado$/);
});
