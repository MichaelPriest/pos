import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/030_intake_consignment.sql',import.meta.url),'utf8');
const page=await readFile(new URL('../pages/entradas.jsx',import.meta.url),'utf8');
const db=await readFile(new URL('../lib/supabase.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const layout=await readFile(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('modela entrada, consignante, peça e repasse',()=>{
  for(const table of ['consignors','inventory_intakes','inventory_intake_items','consignment_settlements']){
    assert.match(migration,new RegExp(`create table if not exists public\\.${table}`,'i'));
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
  }
  assert.match(migration,/source_type text not null check\(source_type in\('purchase','consignment','donation'\)\)/i);
  assert.match(migration,/store_commission_percent numeric\(5,2\)/i);
});

test('aprovação cria produto e preserva origem da peça',()=>{
  assert.match(migration,/create or replace function public\.approve_intake_item\(p_item_id uuid\)/i);
  assert.match(migration,/insert into public\.products/i);
  assert.match(migration,/acquisition_type,acquisition_cost,consignor_id,intake_item_id/i);
  assert.match(migration,/set product_id=new_product_id,status='listed'/i);
  assert.match(migration,/revoke all on function public\.approve_intake_item\(uuid\) from public,anon/i);
});

test('venda consignada gera repasse e baixa integra financeiro',()=>{
  assert.match(migration,/create or replace function public\.create_consignment_settlements\(\)/i);
  assert.match(migration,/after insert or update of status on public\.orders/i);
  assert.match(migration,/on conflict\(order_item_id\) do nothing/i);
  assert.match(migration,/create or replace function public\.pay_consignment_settlement/i);
  assert.match(migration,/insert into public\.financial_entries/i);
});

test('workspace de entradas está roteado e protegido para equipe autorizada',()=>{
  assert.match(main,/const Intake = lazy\(\(\) => import\('\.\.\/pages\/entradas'\)\)/);
  assert.match(main,/path="\/entradas" element=\{<Intake\/>\}/);
  assert.match(layout,/\['\/entradas','📥','Entradas'\]/);
  assert.match(page,/AuthGuard roles=\{\['admin','manager','inventory'\]\}/);
});

test('camada de dados cobre o ciclo operacional',()=>{
  for(const call of ['consignors','createConsignor','inventoryIntakes','createInventoryIntake','createInventoryIntakeItem','approveInventoryIntakeItem','consignmentSettlements','payConsignmentSettlement']){
    assert.match(db,new RegExp(`\\b${call}\\b`));
  }
});

test('schema base inclui o ciclo de entrada e consignação',()=>{
  assert.match(schema,/AUDIT-INTAKE-CONSIGNMENT-2026-10/);
  assert.match(schema,/create table if not exists public\.consignment_settlements/i);
});
