import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStripeCheckoutBody, normalizeOrderId, resumeExisting, validatePaymentAvailability } from '../api/payments/create.js';

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

test('retoma a mesma sessão Stripe enquanto a cobrança permanece aberta', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok:true, json:async()=>({ id:'cs_open', status:'open', url:'https://checkout.stripe.test/cs_open' }) });
  assert.deepEqual(await resumeExisting({ payment_reference:'cs_open' }, 'stripe', 'sk_test'), { url:'https://checkout.stripe.test/cs_open', reference:'cs_open', resumed:true });
});

test('não reutiliza cobrança Stripe expirada', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok:true, json:async()=>({ id:'cs_expired', status:'expired' }) });
  assert.equal(await resumeExisting({ payment_reference:'cs_expired' }, 'stripe', 'sk_test'), null);
});

test('backend respeita processadores e métodos habilitados no checkout', () => {
  const enabled={stripe_enabled:true,mercadopago_enabled:true,pagbank_enabled:true,pix_enabled:true,card_enabled:true};
  assert.equal(validatePaymentAvailability('stripe','cartao',enabled,'sk_test'),true);
  assert.equal(validatePaymentAvailability('mercadopago','pix',enabled,'APP_USR-test'),true);
  assert.equal(validatePaymentAvailability('pagbank','pix',enabled,'token-test'),true);
  assert.throws(()=>validatePaymentAvailability('stripe','cartao',{...enabled,stripe_enabled:false},'sk_test'),/desativado/);
  assert.throws(()=>validatePaymentAvailability('mercadopago','pix',{...enabled,pix_enabled:false},'token-test'),/Pix está desativado/);
  assert.throws(()=>validatePaymentAvailability('stripe','pix',enabled,'sk_test'),/somente para cartão/);
  assert.throws(()=>validatePaymentAvailability('pagbank','cartao',enabled,'token-test'),/somente para Pix/);
});
