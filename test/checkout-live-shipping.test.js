import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/041_server_shipping_quotes.sql',import.meta.url),'utf8');
const api=await readFile(new URL('../api/shipping/checkout-quotes.js',import.meta.url),'utf8');
const checkout=await readFile(new URL('../pages/checkout.jsx',import.meta.url),'utf8');

test('shipping_quotes não é acessível diretamente pelo cliente',()=>{
  assert.match(migration,/alter table public\.shipping_quotes enable row level security/i);
  assert.match(migration,/revoke all on table public\.shipping_quotes from public,anon,authenticated/i);
  assert.match(migration,/grant select,insert,update,delete on table public\.shipping_quotes to service_role/i);
});

test('checkout consome cotação somente do próprio cliente e uma única vez',()=>{
  assert.match(migration,/where id=quote_id and customer_id=auth\.uid\(\)/i);
  assert.match(migration,/expires_at>now\(\) and consumed_at is null/i);
  assert.match(migration,/for update/i);
  assert.match(migration,/update public\.shipping_quotes set consumed_at=now\(\)/i);
});

test('banco rejeita cotação se CEP, sacola, desconto ou cupom mudarem',()=>{
  assert.match(migration,/O CEP mudou; recalcule o frete/i);
  assert.match(migration,/A sacola mudou; recalcule o frete/i);
  assert.match(migration,/O desconto mudou; recalcule o frete/i);
  assert.match(migration,/O cupom mudou; recalcule o frete/i);
});

test('API de checkout calcula subtotal e cupom no servidor',()=>{
  assert.ok(api.includes("select=id,price,stock,active"));
  assert.ok(api.includes("coupon_code"));
  assert.ok(api.includes("discount_type==='percentage'"));
  assert.ok(api.includes('subtotal*Number(row.discount_value)/100'));
  assert.doesNotMatch(api,/req\.body\?\.price|req\.body\?\.shipping_cost/);
});

test('API registra cotações no banco antes de retorná-las ao navegador',()=>{
  assert.ok(api.includes("'/rest/v1/shipping_quotes'"));
  assert.ok(api.includes("Prefer:'return=representation'"));
  assert.ok(api.includes('quote_id:row.id'));
  assert.ok(api.includes('customer_price'));
});

test('checkout envia apenas o id da cotação selecionada',()=>{
  assert.ok(checkout.includes('shipping_quote_id:form.shipping_quote_id||null'));
  assert.ok(checkout.includes('/api/shipping/checkout-quotes'));
  assert.ok(checkout.includes('quote.quote_id'));
  assert.ok(checkout.includes('shippingQuotes.length'));
});

test('checkout mantém frete fixo e retirada como fallback',()=>{
  assert.ok(checkout.includes('Correios PAC'));
  assert.ok(checkout.includes('Entrega expressa'));
  assert.ok(checkout.includes('Retirada na loja'));
  assert.ok(checkout.includes('Frete ao vivo indisponível; usando a tabela de frete da loja.'));
});

test('checkout do cliente nunca usa preços do Sandbox',()=>{
  assert.ok(api.includes("settings.melhorenvio_sandbox!==false"));
  assert.ok(api.includes('Frete ao vivo em homologação. Usando a tabela de frete da loja.'));
});
