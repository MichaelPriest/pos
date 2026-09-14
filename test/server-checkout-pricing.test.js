import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/026_server_checkout_pricing.sql',import.meta.url),'utf8');
const checkout = await readFile(new URL('../pages/checkout.jsx',import.meta.url),'utf8');
const payment = await readFile(new URL('../api/payments/create.js',import.meta.url),'utf8');

test('checkout calcula o frete com valores mantidos no banco', () => {
  assert.match(migration,/standard_shipping_cost/);
  assert.match(migration,/express_shipping_cost/);
  assert.match(migration,/when shipping_method='Retirada na loja' then 0/);
  assert.match(migration,/order_subtotal>=store_config\.free_shipping_threshold/);
  assert.doesNotMatch(migration,/payload->>'shipping_cost'/);
  assert.doesNotMatch(checkout,/shipping_cost:shipping/);
});

test('checkout rejeita entrega, pagamento e endereço manipulados', () => {
  assert.match(migration,/Forma de entrega inválida/);
  assert.match(migration,/Forma de pagamento inválida/);
  assert.match(migration,/Retirada na loja indisponível/);
  assert.match(migration,/Endereço de entrega incompleto/);
  assert.match(migration,/temporariamente em manutenção/);
});

test('cobrança exige provedor permitido e vínculo persistido', () => {
  assert.match(payment,/providerAllowed\(provider,orders\[0\],store\)/);
  assert.match(payment,/if\(!saved\.ok\)throw new Error/);
  assert.match(payment,/Idempotency-Key/);
  assert.match(payment,/`order-\$\{order.id\}`/);
});
