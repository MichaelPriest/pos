import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('../pages/financeiro.jsx',import.meta.url),'utf8');
test('financeiro carrega sessões e movimentos do caixa',()=>{assert.match(page,/db\.cashHistory\(\)/);assert.match(page,/cash_movements/);assert.match(page,/cashSales/);assert.match(page,/withdrawals/)});
test('financeiro não soma novamente vendas em dinheiro ao resultado',()=>{assert.match(page,/balance:sales\+income-expense/);assert.doesNotMatch(page,/balance:sales\+income\+cashSales/)});
test('financeiro exibe conciliação e diferenças de fechamentos',()=>{assert.match(page,/Conciliação dos caixas/);assert.match(page,/expected_balance/);assert.match(page,/counted_balance/);assert.match(page,/cashDifference/)});
