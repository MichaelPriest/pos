import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const admin=await readFile(new URL('../pages/admin.jsx',import.meta.url),'utf8');

test('dashboard carrega filas operacionais reais do brechó',()=>{
  assert.ok(admin.includes('db.inventoryIntakes()'));
  assert.ok(admin.includes('db.orderReturns()'));
  assert.ok(admin.includes('db.consignmentSettlements()'));
  assert.ok(admin.includes("item.status==='pending'"));
  assert.ok(admin.includes("['requested','approved','received'].includes(item.status)"));
  assert.ok(admin.includes("new Date(item.available_at).getTime()<=Date.now()"));
  assert.ok(admin.includes("['pago','separando'].includes(order.status)"));
});

test('cards operacionais levam para os módulos correspondentes',()=>{
  assert.ok(admin.includes("router.push('/entradas')"));
  assert.ok(admin.includes("router.push('/trocas')"));
  assert.ok(admin.includes("router.push('/consignantes')"));
  assert.ok(admin.includes("router.replace('/admin?tab=Logística')"));
  assert.ok(admin.includes('releasedSettlementAmount'));
  assert.ok(admin.includes('pendingIntakeItems'));
  assert.ok(admin.includes('shippingQueue'));
});
