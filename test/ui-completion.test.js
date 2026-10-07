import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const nav=readFileSync(new URL('../components/CustomerMobileNav.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles/reveste.css',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/quality.yml',import.meta.url),'utf8');
const userMenu=readFileSync(new URL('../components/UserMenu.jsx',import.meta.url),'utf8');

test('loja mobile mantém navegação persistente sem invadir a área restrita',()=>{
  assert.match(main,/CustomerMobileNav/);
  for(const label of ['Loja','Favoritos','Doar','Avisos','Conta'])assert.match(nav,new RegExp(`label:'${label}'`));
  assert.match(nav,/systemPaths/);
  assert.match(nav,/aria-current/);
  assert.match(css,/\.customer-mobile-nav\{display:none\}/);
});

test('painel usa somente o shell administrativo global',()=>{
  assert.match(css,/\.system-workspace \.admin-side\{display:none!important\}/);
  assert.match(css,/\.system-workspace \.admin-main\{width:100%;margin-left:0/);
});

test('pipeline usa lockfile e instalação reprodutível',()=>{
  assert.match(workflow,/cache-dependency-path: package-lock\.json/);
  assert.match(workflow,/npm ci --ignore-scripts/);
});

test('feedback do perfil não bloqueia a interface com alert nativo',()=>{
  assert.doesNotMatch(userMenu,/alert\(error\.message\)/);
  assert.match(userMenu,/aria-live="polite"/);
});
