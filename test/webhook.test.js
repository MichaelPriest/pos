import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { mapPaymentStatus, verifyStripeSignature } from '../api/payments/webhook.js';

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

test('normaliza estados externos antes de conciliar o pedido',()=>{
  for(const status of ['approved','paid','PAID','COMPLETED'])assert.equal(mapPaymentStatus(status),'pago');
  for(const status of ['cancelled','canceled','CANCELED','rejected','DECLINED','expired','EXPIRED'])assert.equal(mapPaymentStatus(status),'cancelado');
  for(const status of ['pending','IN_ANALYSIS',undefined])assert.equal(mapPaymentStatus(status),'pendente');
});
