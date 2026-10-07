import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api=await readFile(new URL('../api/shipping/melhor-envio.js',import.meta.url),'utf8');
const hub=await readFile(new URL('../components/IntegrationHub.jsx',import.meta.url),'utf8');
const admin=await readFile(new URL('../pages/admin.jsx',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/040_melhor_envio_logistics.sql',import.meta.url),'utf8');

test('Melhor Envio usa token apenas no servidor e exige equipe autorizada',()=>{
  assert.ok(api.includes("provider=eq.melhorenvio"));
  assert.ok(api.includes("decrypt(rows[0].encrypted_value)"));
  assert.ok(api.includes("['admin','manager'].includes(profiles[0]?.role)"));
  assert.ok(api.includes("'User-Agent':'ReVeste ('"));
});

test('fluxo segue cotação, carrinho, compra, geração, impressão e rastreio',()=>{
  for(const path of [
    '/api/v2/me/shipment/calculate',
    '/api/v2/me/cart',
    '/api/v2/me/shipment/checkout',
    '/api/v2/me/shipment/generate',
    '/api/v2/me/shipment/print',
    '/api/v2/me/shipment/tracking'
  ]) assert.ok(api.includes(path),path);
});

test('compra e geração exigem confirmação explícita',()=>{
  assert.ok(api.includes("req.body?.confirm_purchase!==true"));
  assert.ok(api.includes("req.body?.confirm_generate!==true"));
  assert.ok(admin.includes("confirm_purchase:true"));
  assert.ok(admin.includes("confirm_generate:true"));
});

test('carrinho envia produtos para declaração e exige NF-e em modo fiscal',()=>{
  assert.ok(api.includes('products:products(order)'));
  assert.ok(api.includes("settings.shipping_document_mode==='invoice'"));
  assert.ok(api.includes("key.length!==44"));
  assert.ok(api.includes('options.invoice={key}'));
});

test('painel configura remetente, pacote, sandbox e documento fiscal',()=>{
  assert.ok(hub.includes('shipping_origin_zip_code'));
  assert.ok(hub.includes('shipping_package_weight'));
  assert.ok(hub.includes('shipping_document_mode'));
  assert.ok(hub.includes('melhorenvio_sandbox'));
  assert.ok(hub.includes("'melhorenvio'"));
});

test('fila de expedição expõe ciclo Melhor Envio e preserva despacho manual',()=>{
  assert.ok(admin.includes('Cotar frete'));
  assert.ok(admin.includes('Comprar etiqueta'));
  assert.ok(admin.includes('Gerar etiqueta'));
  assert.ok(admin.includes('Imprimir ME'));
  assert.ok(admin.includes('Atualizar ME'));
  assert.ok(admin.includes('Confirmar despacho'));
});

test('schema de logística registra IDs, preço, prazo, etiqueta e status',()=>{
  for(const field of [
    'shipping_provider_shipment_id','shipping_provider_status','shipping_quote_amount',
    'shipping_quote_days','shipping_label_url','shipping_invoice_key','shipping_document_mode'
  ]) assert.ok(migration.includes(field),field);
});

test('impressão persiste estado e despacho Melhor Envio reutiliza despacho transacional',()=>{
  assert.ok(api.includes("shipping_provider_status:'printed'"));
  assert.ok(admin.includes('dispatchMelhorEnvio'));
  assert.ok(admin.includes('Despachar ME'));
  assert.ok(admin.includes('db.dispatchOrder'));
  assert.ok(admin.includes("order.tracking_code&&order.status!=='enviado'"));
});
