import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { verifyStripeSignature } from '../api/payments/webhook.js';
import { readFile } from 'node:fs/promises';

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

test('webhooks de Pix consultam a operadora antes de conciliar o pedido', async () => {
  const source=await readFile(new URL('../api/payments/webhook.js',import.meta.url),'utf8');
  assert.match(source,/mercadopago\.com\/v1\/payments/);
  assert.match(source,/pagseguro\.com\/orders/);
  assert.match(source,/if\(!response\.ok\|\|!payment\.reference_id\)/);
  assert.match(source,/integration_secrets/);
});

test('processamento de webhook usa claim atômico, lease e limite de corpo', async () => {
  const source=await readFile(new URL('../api/payments/webhook.js',import.meta.url),'utf8');
  const migration=await readFile(new URL('../supabase/migrations/027_atomic_webhook_claims.sql',import.meta.url),'utf8');
  assert.match(source,/MAX_WEBHOOK_BYTES=1024\*1024/);
  assert.match(source,/claim_webhook_event/);
  assert.match(source,/p_claim_token:claimToken/);
  assert.match(migration,/on conflict\(provider,event_id\) do update/);
  assert.match(migration,/locked_at<now\(\)-interval '5 minutes'/);
  assert.match(migration,/claim_token=p_claim_token/);
  assert.match(migration,/to service_role/);
});
