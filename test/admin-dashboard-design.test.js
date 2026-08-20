import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../pages/admin.jsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/SystemLayout.jsx', import.meta.url), 'utf8');

test('painel administrativo possui visão executiva baseada em dados reais', () => {
  assert.match(admin, /DashboardHome/);
  assert.match(admin, /dashboard-period/);
  assert.match(admin, /Vendas da semana/);
  assert.match(admin, /Vendas recentes/);
  assert.match(admin, /Produtos em destaque/);
  assert.match(admin, /paidStatuses\.includes/);
});

test('layout administrativo oferece loja, busca, notificações e nova venda', () => {
  assert.match(layout, /system-store-card/);
  assert.match(layout, /system-global-search/);
  assert.match(layout, /Buscar produtos, clientes ou vendas/);
  assert.match(layout, /Nova venda/);
});
