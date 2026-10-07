import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api=await readFile(new URL('../api/payments/refund.js',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/036_gateway_refunds.sql',import.meta.url),'utf8');
const proration=await readFile(new URL('../supabase/migrations/037_return_discount_proration.sql',import.meta.url),'utf8');
const page=await readFile(new URL('../pages/trocas.jsx',import.meta.url),'utf8');
const db=await readFile(new URL('../lib/supabase.js',import.meta.url),'utf8');

test('reembolso Stripe exige equipe e devolução recebida',()=>{
  assert.ok(api.includes("['admin','manager'].includes(profiles[0]?.role)"));
  assert.ok(api.includes("item.status!=='received'&&item.status!=='completed'"));
  assert.ok(api.includes("order.payment_provider!=='stripe'"));
});

test('Stripe refund recupera Checkout Session e usa PaymentIntent',()=>{
  assert.ok(api.includes('/v1/checkout/sessions/'));
  assert.ok(api.includes('session.payment_intent'));
  assert.ok(api.includes("payment_intent:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id"));
  assert.ok(api.includes("'Idempotency-Key':"));
  assert.ok(api.includes("return-${item.id}"));
});

test('Stripe refund usa valor em centavos e não excede o pedido',()=>{
  assert.ok(api.includes('Math.round(Number(item.refund_amount||0)*100)'));
  assert.ok(api.includes('amount>orderAmount'));
  assert.ok(api.includes("amount:String(amount)"));
});

test('baixa financeira só conclui quando gateway retorna succeeded',()=>{
  assert.ok(api.includes("p_completed:refund.status==='succeeded'"));
  assert.match(migration,/if not p_completed then return null/i);
  assert.match(migration,/insert into public\.financial_entries/i);
  assert.match(migration,/refund_provider='manual'/i);
});

test('RPC de conciliação automática é exclusiva do service role',()=>{
  assert.match(migration,/revoke all on function public\.record_gateway_order_refund\(uuid,text,text,text,boolean\) from public,anon,authenticated/i);
  assert.match(migration,/grant execute on function public\.record_gateway_order_refund\(uuid,text,text,text,boolean\) to service_role/i);
});

test('devolução rateia desconto e não inclui frete automaticamente',()=>{
  assert.match(proration,/merchandise_net:=greatest\(0,coalesce\(target_order\.subtotal,0\)-coalesce\(target_order\.discount,0\)\)/i);
  assert.match(proration,/returned_subtotal\*\(merchandise_net\/target_order\.subtotal\)/i);
  assert.doesNotMatch(proration,/shipping_cost/i);
});

test('tela oferece Stripe automático e fallback manual',()=>{
  assert.ok(page.includes('Estornar no Stripe'));
  assert.ok(page.includes('Confirmar reembolso externo'));
  assert.ok(page.includes('refundOrderReturn'));
  assert.ok(db.includes('refundOrderReturn: async'));
});
