import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const header=await readFile(new URL('../components/CommerceHeader.jsx',import.meta.url),'utf8');
const footer=await readFile(new URL('../components/CommerceFooter.jsx',import.meta.url),'utf8');
const store=await readFile(new URL('../pages/loja.jsx',import.meta.url),'utf8');
const product=await readFile(new URL('../pages/produto.jsx',import.meta.url),'utf8');
const favorites=await readFile(new URL('../pages/favoritos.jsx',import.meta.url),'utf8');
const account=await readFile(new URL('../pages/minha-conta.jsx',import.meta.url),'utf8');
const notifications=await readFile(new URL('../pages/notificacoes.jsx',import.meta.url),'utf8');
const donation=await readFile(new URL('../pages/doar.jsx',import.meta.url),'utf8');
const legal=await readFile(new URL('../pages/legal.jsx',import.meta.url),'utf8');
const system=await readFile(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');

test('chrome de ecommerce é compartilhado nas principais jornadas do cliente',()=>{
  for(const source of [store,product,favorites,account,notifications,donation,legal]) assert.ok(source.includes('CommerceHeader'));
  for(const source of [store,product,favorites,account,notifications,donation,legal]) assert.ok(source.includes('CommerceFooter'));
  assert.ok(header.includes("placeholder="Buscar peças, marcas...""));
  assert.ok(header.includes("cart:updated"));
  assert.ok(footer.includes('/trocas-e-devolucoes'));
});

test('vitrine possui descoberta de categorias e incentivo de frete',()=>{
  assert.ok(store.includes('categoryStats'));
  assert.ok(store.includes('commerce-category-showcase'));
  assert.ok(store.includes('freeShippingRemaining'));
  assert.ok(store.includes('cart-shipping-goal'));
  assert.ok(store.includes('condition_grade'));
});

test('produto oferece caminho de conversão e confiança',()=>{
  assert.ok(product.includes('Comprar agora'));
  assert.ok(product.includes('product-service-grid'));
  assert.ok(product.includes("window.dispatchEvent(new CustomEvent('cart:updated'))"));
  assert.ok(product.includes('condition_grade'));
});

test('favoritos permite mover peça disponível para a sacola',()=>{
  assert.ok(favorites.includes('Adicionar à sacola'));
  assert.ok(favorites.includes('favorite-card-actions'));
  assert.ok(favorites.includes("cart:updated"));
});

test('área administrativa possui topbar contextual e atalhos reais',()=>{
  assert.ok(system.includes('system-topbar'));
  assert.ok(system.includes('Nova entrada'));
  assert.ok(system.includes('PDV'));
  assert.ok(system.includes('Ver loja'));
  assert.ok(system.includes('system-page-frame'));
});
