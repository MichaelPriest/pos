import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildStripeCheckoutBody, normalizeOrderId, paymentOrigin, providerEnabled, resumeExisting } from '../api/payments/create.js';
import { gatewayIdempotencyKey } from '../lib/server/payment-security.js';

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
  global.fetch = async () => ({ ok:true, json:async()=>({ id:'cs_open', status:'open', url:'https://checkout.stripe.test/cs_open', client_reference_id:id, amount_total:4990, currency:'brl' }) });
  assert.deepEqual(await resumeExisting({ id, total:49.9, payment_reference:'cs_open' }, 'stripe', 'sk_test'), { url:'https://checkout.stripe.test/cs_open', reference:'cs_open', resumed:true });
});

test('identifica cobrança Stripe expirada para liberar a reserva', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok:true, json:async()=>({ id:'cs_expired', status:'expired', client_reference_id:id, amount_total:4990, currency:'brl' }) });
  assert.deepEqual(await resumeExisting({ id, total:49.9, payment_reference:'cs_expired' }, 'stripe', 'sk_test'), { expired:true, reference:'cs_expired' });
});

test('só habilita combinações coerentes de provedor e meio de pagamento', () => {
  const settings = { stripe_enabled:true, mercadopago_enabled:false, pagbank_enabled:true, pix_enabled:true, card_enabled:true };
  assert.equal(providerEnabled('stripe', 'cartao', settings), true);
  assert.equal(providerEnabled('stripe', 'pix', settings), false);
  assert.equal(providerEnabled('pagbank', 'pix', settings), true);
  assert.equal(providerEnabled('mercadopago', 'pix', settings), false);
});

test('usa uma chave de idempotência estável por pedido e provedor', () => {
  assert.equal(gatewayIdempotencyKey(id, 'stripe'), `reveste:stripe:${id}`);
  const source = readFileSync(new URL('../api/payments/create.js', import.meta.url), 'utf8');
  assert.match(source, /'Idempotency-Key': idempotencyKey/);
  assert.match(source, /'X-Idempotency-Key': idempotencyKey/);
  assert.match(source, /'x-idempotency-key': idempotencyKey/);
});

test('não deriva URLs de pagamento de um Host não confiável em produção', t => {
  const originalSite = process.env.SITE_URL;
  const originalProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  t.after(() => {
    if (originalSite === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = originalSite;
    if (originalProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL; else process.env.VERCEL_PROJECT_PRODUCTION_URL = originalProductionUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  });
  delete process.env.SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.NODE_ENV = 'production';
  assert.throws(() => paymentOrigin({ headers:{ host:'attacker.test' } }), /SITE_URL/);
  process.env.SITE_URL = 'https://brecho.test/path';
  assert.equal(paymentOrigin({ headers:{ host:'attacker.test' } }), 'https://brecho.test');
});
