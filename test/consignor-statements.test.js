import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/035_consignor_batch_settlement.sql',import.meta.url),'utf8');
const page=await readFile(new URL('../pages/consignantes.jsx',import.meta.url),'utf8');
const db=await readFile(new URL('../lib/supabase.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const layout=await readFile(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('baixa consolidada trava repasses elegíveis antes de somar',()=>{
  assert.match(migration,/with locked as \([\s\S]*for update[\s\S]*\)[\s\S]*sum\(payout_amount\)/i);
  assert.match(migration,/status='pending'[\s\S]*available_at<=now\(\)/i);
});

test('baixa consolidada gera um único lançamento financeiro',()=>{
  assert.match(migration,/insert into public\.financial_entries/i);
  assert.match(migration,/Repasse consolidado para/i);
  assert.match(migration,/set status='paid'[\s\S]*financial_entry_id=entry_id/i);
});

test('RPC exige gestão e não fica disponível para anon',()=>{
  assert.match(migration,/has_system_role\(array\['admin','manager'\]\)/i);
  assert.match(migration,/revoke all on function public\.pay_consignor_settlements\(uuid,text\) from public,anon/i);
  assert.match(migration,/grant execute on function public\.pay_consignor_settlements\(uuid,text\) to authenticated,service_role/i);
});

test('workspace de consignantes está roteado e protegido',()=>{
  assert.ok(main.includes("const Consignors = lazy(() => import('../pages/consignantes'))"));
  assert.ok(main.includes('path="/consignantes" element={<Consignors/>}'));
  assert.ok(layout.includes("['/consignantes','👥','Consignantes']"));
  assert.ok(page.includes("AuthGuard roles={['admin','manager']}"));
});

test('workspace oferece extrato, CSV e baixa consolidada',()=>{
  assert.ok(page.includes('Imprimir extrato'));
  assert.ok(page.includes('Exportar CSV'));
  assert.ok(page.includes('payConsignorSettlements'));
  assert.ok(page.includes("'Pagar '+money(metrics.released)"));
  assert.ok(db.includes('payConsignorSettlements:'));
});

test('schema base inclui fechamento consolidado',()=>{
  assert.match(schema,/AUDIT-CONSIGNOR-BATCH-SETTLEMENT-2026-10/);
  assert.match(schema,/create or replace function public\.pay_consignor_settlements/i);
});

test('extrato não soma consignações canceladas nos indicadores',()=>{
  assert.ok(page.includes("filter(item=>item.status!=='cancelled').reduce"));
  assert.ok(page.includes("rows.filter(item=>item.status!=='cancelled').reduce"));
});

test('peça consignada pode ser devolvida ao proprietário antes da venda',async()=>{
  const migration=await readFile(new URL('../supabase/migrations/038_return_unsold_consignment.sql',import.meta.url),'utf8');
  assert.match(migration,/create or replace function public\.return_consigned_item/i);
  assert.match(migration,/item\.status not in\('pending','listed'\)/i);
  assert.match(migration,/source_type<>'consignment'/i);
  assert.match(migration,/set active=false,stock=0/i);
  assert.match(migration,/set status='returned'/i);
  assert.ok(page.includes('Devolver ao proprietário'));
  assert.ok(db.includes('returnConsignedItem:'));
});
