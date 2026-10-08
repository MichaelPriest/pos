import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const db=await readFile(new URL('../lib/supabase.js',import.meta.url),'utf8');
const admin=await readFile(new URL('../pages/admin.jsx',import.meta.url),'utf8');
const store=await readFile(new URL('../pages/loja.jsx',import.meta.url),'utf8');
const checkout=await readFile(new URL('../pages/checkout.jsx',import.meta.url),'utf8');
const intake=await readFile(new URL('../supabase/migrations/039_purchase_acquisition_finance.sql',import.meta.url),'utf8');
const dispatch=await readFile(new URL('../supabase/migrations/021_transactional_dispatch.sql',import.meta.url),'utf8');
const shipping=await readFile(new URL('../supabase/migrations/041_server_shipping_quotes.sql',import.meta.url),'utf8');

test('admin e loja usam a mesma fonte de produtos e configurações',()=>{
  assert.ok(db.includes("products: (onlyActive = true)"));
  assert.ok(db.includes("settings: async ()"));
  assert.ok(admin.includes('db.products(false)'));
  assert.ok(admin.includes('db.settings()'));
  assert.ok(store.includes('db.products()'));
  assert.ok(store.includes('db.settings()'));
});

test('catálogo público respeita ativo e estoque sem apagar histórico',()=>{
  assert.ok(db.includes("&active=eq.true&stock=gt.0"));
  assert.ok(admin.includes('archiveProduct'));
  assert.ok(admin.includes("{product.active?'Arquivar':'Reativar'}"));
  assert.ok(admin.includes("db.updateProduct(product.id,{active:!product.active})"));
  assert.doesNotMatch(admin,/db\.deleteProduct\(product\.id\)/);
});

test('entrada aprovada vira produto real da loja',()=>{
  assert.match(intake,/insert into public\.products\(name,description,category,size,price,stock,image_url,active,sku,brand,color,condition_grade\)/i);
  assert.match(intake,/status='listed'/i);
  assert.match(intake,/product_id=new_product_id/i);
});

test('checkout e PDV baixam estoque no banco, não apenas na interface',async()=>{
  const pos=await readFile(new URL('../supabase/migrations/022_cash_and_inventory_integrity.sql',import.meta.url),'utf8');
  assert.match(shipping,/update products set stock=stock-requested\.quantity/i);
  assert.match(pos,/update products set stock=stock-requested\.quantity/i);
});

test('cupons do admin são os mesmos validados no checkout',()=>{
  assert.ok(admin.includes('db.createCoupon'));
  assert.ok(checkout.includes('db.validateCoupon'));
  assert.match(shipping,/from coupons/i);
  assert.match(shipping,/used_count=used_count\+1/i);
});

test('status administrativo não pula pagamento despacho ou pós-venda',()=>{
  assert.ok(admin.includes('orderStatusOptions'));
  assert.ok(admin.includes("pago:['pago','separando']"));
  assert.ok(admin.includes("enviado:['enviado','concluido']"));
  assert.ok(admin.includes('Use o despacho para marcar um pedido como enviado'));
  assert.ok(admin.includes('Cancelamentos devem usar o fluxo de trocas/devoluções'));
});

test('despacho altera pedido e cria rastreio na mesma transação',()=>{
  assert.match(dispatch,/update orders set carrier=/i);
  assert.match(dispatch,/status='enviado'/i);
  assert.match(dispatch,/insert into tracking_events/i);
  assert.ok(admin.includes('db.dispatchOrder'));
});

test('frete ao vivo usa cotação validada no servidor e mantém fallback',()=>{
  assert.ok(checkout.includes('/api/shipping/checkout-quotes'));
  assert.ok(checkout.includes('shipping_quote_id'));
  assert.ok(checkout.includes('Correios PAC'));
  assert.ok(checkout.includes('Entrega expressa'));
  assert.match(shipping,/shipping_quotes/i);
  assert.match(shipping,/consumed_at is null/i);
});
