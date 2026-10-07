import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/031_returns_exchange_flow.sql',import.meta.url),'utf8');
const page=await readFile(new URL('../pages/trocas.jsx',import.meta.url),'utf8');
const db=await readFile(new URL('../lib/supabase.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const layout=await readFile(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('modela devolução e itens vinculados ao pedido original',()=>{
  assert.match(migration,/create table if not exists public\.order_returns/i);
  assert.match(migration,/create table if not exists public\.order_return_items/i);
  assert.match(migration,/resolution text not null check\(resolution in\('refund','exchange'\)\)/i);
  assert.match(migration,/refund_status text not null default 'pending'/i);
});

test('abertura de pós-venda valida pedido e itens vendidos',()=>{
  assert.match(migration,/create or replace function public\.create_order_return/i);
  assert.match(migration,/target_order\.status not in\('pago','separando','enviado','concluido'\)/i);
  assert.match(migration,/Quantidade devolvida excede a quantidade vendida/i);
  assert.match(migration,/Este item já possui uma devolução ativa/i);
});

test('recebimento reconcilia consignação antes de repor o estoque',()=>{
  assert.match(migration,/create or replace function public\.receive_order_return/i);
  assert.match(migration,/cs\.status='paid'[\s\S]*Repasse de consignação já pago|Há repasse de consignação já pago/i);
  assert.match(migration,/update public\.consignment_settlements cs[\s\S]*set status='cancelled'[\s\S]*cs\.status='pending'/i);
  assert.match(migration,/update public\.products set stock=stock\+item\.quantity,active=true/i);
  assert.match(migration,/set status=case when resolution='exchange' then 'completed' else 'received' end/i);
});

test('reembolso mantém fallback manual e oferece estorno Stripe após recebimento',async()=>{
  const gateway=await readFile(new URL('../supabase/migrations/036_gateway_refunds.sql',import.meta.url),'utf8');
  assert.match(gateway,/create or replace function public\.confirm_manual_order_refund/i);
  assert.match(gateway,/if target\.status<>'received' then raise exception 'Receba a peça antes de confirmar o reembolso'/i);
  assert.match(gateway,/create or replace function public\.record_gateway_order_refund/i);
  assert.match(page,/Estornar no Stripe/i);
  assert.match(page,/Confirmar reembolso externo/i);
  assert.match(page,/Mercado Pago, PagBank e outros meios continuam exigindo confirmação manual/i);
});

test('workspace está roteado e protegido para gestão',()=>{
  assert.match(main,/const Returns = lazy\(\(\) => import\('\.\.\/pages\/trocas'\)\)/);
  assert.match(main,/path="\/trocas" element=\{<Returns\/>\}/);
  assert.match(layout,/\['\/trocas','↩️','Trocas e devoluções'\]/);
  assert.match(page,/AuthGuard roles=\{\['admin','manager'\]\}/);
});

test('camada de dados cobre pós-venda',()=>{
  for(const name of ['orderReturns','createOrderReturn','receiveOrderReturn','confirmManualOrderRefund','refundOrderReturn']) assert.match(db,new RegExp(`\\b${name}\\b`));
});

test('schema base inclui pós-venda',()=>{
  assert.match(schema,/AUDIT-RETURNS-EXCHANGE-2026-10/);
  assert.match(schema,/create table if not exists public\.order_returns/i);
});
