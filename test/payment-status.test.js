import assert from 'node:assert/strict';
import test from 'node:test';
import { orderStatusForPayment } from '../api/payments/status.js';

test('somente confirma pedido quando a operadora informa pagamento aprovado', () => {
  for (const status of ['paid','approved','PAID']) assert.equal(orderStatusForPayment(status), 'pago');
  for (const status of ['pending','processing','open']) assert.equal(orderStatusForPayment(status), 'pendente');
});

test('cancela pedidos recusados, expirados ou não pagos', () => {
  for (const status of ['unpaid','canceled','cancelled','rejected','DECLINED','expired']) assert.equal(orderStatusForPayment(status), 'cancelado');
});
