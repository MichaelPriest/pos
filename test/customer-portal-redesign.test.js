import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shell=await readFile(new URL('../components/CustomerPortalShell.jsx',import.meta.url),'utf8');
const account=await readFile(new URL('../pages/minha-conta.jsx',import.meta.url),'utf8');
const favorites=await readFile(new URL('../pages/favoritos.jsx',import.meta.url),'utf8');
const notifications=await readFile(new URL('../pages/notificacoes.jsx',import.meta.url),'utf8');
const donation=await readFile(new URL('../pages/doar.jsx',import.meta.url),'utf8');

test('área do cliente usa portal único nas jornadas autenticadas',()=>{
  for(const source of [account,favorites,notifications,donation]) assert.ok(source.includes('CustomerPortalShell'));
  assert.ok(shell.includes('Visão geral'));
  assert.ok(shell.includes('Meus pedidos'));
  assert.ok(shell.includes('Favoritos'));
  assert.ok(shell.includes('Notificações'));
  assert.ok(shell.includes('Endereços'));
  assert.ok(shell.includes('Circularidade'));
  assert.ok(shell.includes('Meus dados'));
});

test('dashboard da conta oferece resumo e atalhos reais',()=>{
  assert.ok(account.includes('customer-dashboard-kpis'));
  assert.ok(account.includes('COMPRAS CONFIRMADAS'));
  assert.ok(account.includes('customer-quick-panel'));
  assert.ok(account.includes('latestOrder'));
  assert.ok(account.includes('activeOrders'));
  assert.ok(account.includes('spent'));
});

test('cliente gerencia endereço dentro da própria conta',()=>{
  assert.ok(account.includes('customer-address-form'));
  assert.ok(account.includes('db.saveAddress(addressForm)'));
  assert.ok(account.includes('findAddress(addressForm.zip_code)'));
  assert.ok(account.includes('db.deleteAddress(id)'));
  assert.ok(account.includes('Tornar principal'));
});

test('cliente pode atualizar foto e dados pessoais no portal',()=>{
  assert.ok(account.includes("storage.uploadImage('avatars'"));
  assert.ok(account.includes('db.updateProfile(profile.id,{avatar_url})'));
  assert.ok(account.includes('db.updateMyDetails(form)'));
  assert.ok(account.includes('customer-profile-grid'));
});

test('pedidos exibem pagamento entrega itens e rastreio',()=>{
  assert.ok(account.includes('customer-order-redesign'));
  assert.ok(account.includes('Retomar pagamento'));
  assert.ok(account.includes('tracking_events'));
  assert.ok(account.includes('tracking_url'));
  assert.ok(account.includes('customer-order-progress'));
});

test('favoritos notificações e circularidade permanecem integrados ao portal',()=>{
  assert.ok(favorites.includes('Adicionar à sacola'));
  assert.ok(notifications.includes('Marcar todas como lidas'));
  assert.ok(donation.includes('Faça suas peças circularem'));
  assert.ok(shell.includes('db.unreadNotificationsCount()'));
});
