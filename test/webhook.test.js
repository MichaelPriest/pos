import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { verifyMercadoPagoSignature, verifyStripeSignature } from '../api/payments/webhook.js';
import { assertPaymentMatches } from '../lib/server/payment-security.js';

const secret = 'whsec_test';
const timestamp = 1_686_089_970;
const raw = Buffer.from('{"id":"evt_abc123xyz","type":"setup_intent.created"}');
const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');

test('aceita assinatura Stripe v1 válida', () => {
  assert.doesNotThrow(() => verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`, secret, timestamp * 1000));
});

test('aceita uma das múltiplas assinaturas durante rotação de segredo', () => {
  assert.doesNotThrow(() => verifyStripeSignature(raw, `t=${timestamp},v1=${'0'.repeat(64)},v1=${signature}`, secret, timestamp * 1000));
});

test('recusa assinatura inválida ou com mais de cinco minutos', () => {
  assert.throws(() => verifyStripeSignature(raw, `t=${timestamp},v1=${'0'.repeat(64)}`, secret, timestamp * 1000), /inválida/);
  assert.throws(() => verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`, secret, (timestamp + 301) * 1000), /expirada/);
});

test('valida a assinatura HMAC do Mercado Pago com request e pagamento', () => {
  const requestId = 'request-123';
  const paymentId = '456789';
  const timestamp = '1686089970';
  const manifest = `id:${paymentId};request-id:${requestId};ts:${timestamp};`;
  const digest = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  assert.doesNotThrow(() => verifyMercadoPagoSignature(`ts=${timestamp},v1=${digest}`, requestId, paymentId, secret));
  assert.throws(() => verifyMercadoPagoSignature(`ts=${timestamp},v1=${'0'.repeat(64)}`, requestId, paymentId, secret), /inválida/);
  assert.throws(() => verifyMercadoPagoSignature(`ts=${timestamp},v1=${digest}`, '', paymentId, secret), /ausente/);
});

test('recusa pagamento com valor ou moeda diferente do pedido', () => {
  const order = { total:49.9 };
  assert.equal(assertPaymentMatches(order, 49.9, 'BRL'), true);
  assert.equal(assertPaymentMatches(order, 4990, 'brl', { amountInCents:true }), true);
  assert.throws(() => assertPaymentMatches(order, 48.9, 'BRL'), /valor/);
  assert.throws(() => assertPaymentMatches(order, 49.9, 'USD'), /moeda/);
});
