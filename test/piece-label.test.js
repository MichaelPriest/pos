import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const barcode=await readFile(new URL('../components/Barcode39.jsx',import.meta.url),'utf8');
const page=await readFile(new URL('../pages/etiqueta-peca/[id].jsx',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const intake=await readFile(new URL('../pages/entradas.jsx',import.meta.url),'utf8');
const db=await readFile(new URL('../lib/supabase.js',import.meta.url),'utf8');

test('barcode Code 39 possui tabela, start stop e normalização',()=>{
  assert.ok(barcode.includes("'*':'nwnnwnwnn'"));
  assert.ok(barcode.includes('const encoded='));
  assert.ok(barcode.includes('normalizeCode39'));
  assert.ok(barcode.includes('Código de barras'));
});

test('etiqueta interna usa SKU quando barcode não estiver preenchido',()=>{
  assert.ok(page.includes("product?.barcode||product?.sku||''"));
  assert.ok(page.includes("AuthGuard roles={['admin','manager','inventory']}"));
  assert.ok(db.includes('productLabel: async'));
  assert.ok(db.includes('select=id,name,category,size,price,sku,barcode,brand,color,condition_grade,active'));
});

test('rota e ação de impressão ficam ligadas ao fluxo de entradas',()=>{
  assert.ok(main.includes("const PieceLabel = lazy(() => import('../pages/etiqueta-peca/[id]'))"));
  assert.ok(main.includes('path="/etiqueta-peca/:id" element={<PieceLabel/>}'));
  assert.ok(intake.includes('/etiqueta-peca/'));
  assert.ok(intake.includes('item.product_id'));
  assert.ok(intake.includes('Imprimir etiqueta'));
});
