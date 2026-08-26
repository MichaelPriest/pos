import assert from 'node:assert/strict';
import test from 'node:test';
import { orderStatusForPayment, providerStatus } from '../api/payments/status.js';

test('somente confirma pedido quando a operadora informa pagamento aprovado', () => {
  for (const status of ['paid','approved','PAID']) assert.equal(orderStatusForPayment(status), 'pago');
  for (const status of ['pending','processing','open']) assert.equal(orderStatusForPayment(status), 'pendente');
});

test('cancela pedidos recusados, expirados ou não pagos', () => {
  for (const status of ['unpaid','canceled','cancelled','rejected','DECLINED','CANCELED','EXPIRED','expired']) assert.equal(orderStatusForPayment(status), 'cancelado');
});

test('consulta pagamento Mercado Pago pela referência externa do pedido', async t => {
  const originalFetch = global.fetch;
  const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  t.after(() => { global.fetch = originalFetch; if (originalToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN; else process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken; });
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'access-token-test';
  const calls = [];
  global.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes('integration_secrets')) return { ok:true, json:async()=>[] };
    return { ok:true, json:async()=>({ results:[{ id:321, external_reference:'order-1', transaction_amount:49.9, currency_id:'BRL', status:'approved' }] }) };
  };
  const payment = await providerStatus({ id:'order-1', total:49.9, payment_provider:'mercadopago', payment_reference:'preference-1' }, null, 'https://supabase.test', 'service-key');
  assert.deepEqual(payment, { status:'approved', reference:321 });
  assert.match(calls[1], /\/v1\/payments\/search\?/);
  assert.match(calls[1], /external_reference=order-1/);
  assert.doesNotMatch(calls[1], /preference-1/);
});
