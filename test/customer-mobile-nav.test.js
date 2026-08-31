import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nav=readFileSync(new URL('../components/CustomerMobileNav.jsx',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('loja mobile mantém atalhos públicos em todas as páginas do cliente',()=>{
  for(const label of ['Loja','Favoritos','Doar','Avisos','Conta'])assert.match(nav,new RegExp(`['"]${label}['"]`));
  assert.match(main,/<CustomerMobileNav\/>/);
  assert.match(nav,/aria-label="Atalhos da loja"/);
});

test('atalhos públicos não duplicam a navegação administrativa',()=>{
  assert.match(nav,/systemPaths/);
  assert.match(nav,/return null/);
});
