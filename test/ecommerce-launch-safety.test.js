import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/026_ecommerce_launch_safety.sql', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../pages/checkout.jsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../pages/admin.jsx', import.meta.url), 'utf8');
const pdv = readFileSync(new URL('../pages/pdv.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/supabase.js', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

test('frete do pedido é calculado pelas configurações do banco', () => {
  assert.match(migration, /standard_shipping_cost/);
  assert.match(migration, /express_shipping_cost/);
  assert.match(migration, /shipping_method='Correios PAC'/);
  assert.doesNotMatch(migration, /payload->>'shipping_cost'/);
  assert.doesNotMatch(checkout, /shipping_cost:shipping/);
});

test('painel altera pedido apenas pela RPC de transição controlada', () => {
  assert.match(migration, /transition_order_status/);
  assert.match(migration, /Transição de status não permitida/);
  assert.match(migration, /drop policy if exists "admin atualiza pedidos"/);
  assert.match(client, /rpc\/transition_order_status/);
  assert.match(admin, /nextOrderStatuses/);
  assert.doesNotMatch(admin, /db\.updateShipment/);
});

test('webhooks são reivindicados de forma transacional e podem recuperar execução interrompida', () => {
  assert.match(migration, /claim_webhook_event/);
  assert.match(migration, /for update/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /grant execute on function public\.claim_webhook_event.*service_role/);
});

test('PDV não declara Pix, cartão ou cupom fiscal como concluídos sem integração', () => {
  assert.match(migration, /method<>'dinheiro'/);
  assert.match(migration, /receipt<>'nao_fiscal'/);
  assert.match(pdv, /Pix e cartão serão liberados após integração/);
  assert.doesNotMatch(pdv, /setPayment|setReceipt/);
});

test('publica arquivos reais de descoberta para buscadores', () => {
  assert.match(robots, /^User-agent:/);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /<urlset/);
  assert.match(sitemap, /\/loja<\/loc>/);
});
