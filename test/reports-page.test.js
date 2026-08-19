import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('../pages/relatorios.jsx',import.meta.url),'utf8');
test('relatórios combinam período, pesquisa, status, canal e pagamento',()=>{for(const setter of ['setFrom','setTo','setQuery','setStatus','setChannel','setPayment'])assert.match(page,new RegExp(setter));assert.match(page,/data inicial não pode/)});
test('indicadores consideram somente vendas confirmadas filtradas',()=>{assert.match(page,/paidStatuses\.includes/);assert.match(page,/vendas confirmadas filtradas/);assert.match(page,/ticket/)});
test('relatório inclui rankings e exportação segura em CSV',()=>{assert.match(page,/Pedidos por status/);assert.match(page,/Receita por pagamento/);assert.match(page,/Categorias mais vendidas/);assert.match(page,/csvCell/);assert.match(page,/revokeObjectURL/)});
