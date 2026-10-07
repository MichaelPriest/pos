import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page=await readFile(new URL('../pages/rentabilidade.jsx',import.meta.url),'utf8');
const db=await readFile(new URL('../lib/supabase.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const layout=await readFile(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');

test('rentabilidade cruza pedidos com origem, repasses e devoluções',()=>{
  assert.ok(page.includes('db.inventoryIntakes()'));
  assert.ok(page.includes('db.consignmentSettlements()'));
  assert.ok(page.includes('db.orderReturns()'));
  assert.ok(page.includes("returns.filter(item=>['received','completed'].includes(item.status))"));
});

test('desconto do pedido é rateado pelos itens vendidos',()=>{
  assert.ok(page.includes('merchandiseNet=Math.max(0,subtotal-discount)'));
  assert.ok(page.includes('factor=subtotal>0?merchandiseNet/subtotal:1'));
  assert.ok(page.includes('net=gross*factor'));
});

test('margem considera custo próprio e repasse de consignação',()=>{
  assert.ok(page.includes("origin.source_type==='purchase'"));
  assert.ok(page.includes('origin.acquisition_cost*qty'));
  assert.ok(page.includes("origin.source_type==='consignment'"));
  assert.ok(page.includes('settlement?.payout_amount'));
  assert.ok(page.includes('margin:net-cost'));
});

test('relatório de vendas traz ids necessários ao cruzamento',()=>{
  assert.ok(db.includes('order_items(id,product_id,quantity,unit_price,products(name,category))'));
});

test('rota de rentabilidade está protegida e navegável',()=>{
  assert.ok(main.includes("const Profitability = lazy(() => import('../pages/rentabilidade'))"));
  assert.ok(main.includes('path="/rentabilidade" element={<Profitability/>}'));
  assert.ok(layout.includes("['/rentabilidade','📈','Rentabilidade']"));
  assert.ok(page.includes("AuthGuard roles={['admin','manager']}"));
});

test('relatório oferece CSV e indicadores de margem',()=>{
  assert.ok(page.includes('Exportar CSV'));
  assert.ok(page.includes('Margem bruta'));
  assert.ok(page.includes('Custos + repasses'));
  assert.ok(page.includes('Descontos rateados'));
});
