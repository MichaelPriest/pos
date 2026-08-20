import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../pages/admin.jsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/SystemLayout.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/reveste.css', import.meta.url), 'utf8');

test('painel administrativo possui visão executiva baseada em dados reais', () => {
  assert.match(admin, /DashboardHome/);
  assert.match(admin, /dashboard-period/);
  assert.match(admin, /Vendas da semana/);
  assert.match(admin, /dashboard-line-chart/);
  assert.match(admin, /chartPoints/);
  assert.match(admin, /Vendas recentes/);
  assert.match(admin, /Produtos em destaque/);
  assert.match(admin, /paidStatuses\.includes/);
});

test('layout administrativo oferece loja, busca, notificações e nova venda', () => {
  assert.match(layout, /system-store-card/);
  assert.match(layout, /system-global-search/);
  assert.match(layout, /Buscar produtos, clientes ou vendas/);
  assert.match(layout, /Nova venda/);
  assert.match(layout, /sidebar-collapsed/);
  assert.match(layout, /<Icon/);
});

test('conteúdo ocupa toda a área disponível ao lado da sidebar', () => {
  assert.match(styles, /\.system-layout\{display:block/);
  assert.match(styles, /\.system-workspace\{margin-left:258px;width:calc\(100% - 258px\)/);
  assert.match(styles, /\.system-workspace>main,.system-workspace>\.admin-shell/);
  assert.match(styles, /\.system-workspace\{margin-left:0;width:100%/);
});
