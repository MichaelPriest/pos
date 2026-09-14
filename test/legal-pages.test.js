import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const legal=await readFile(new URL('../pages/legal.jsx',import.meta.url),'utf8');
const store=await readFile(new URL('../pages/loja.jsx',import.meta.url),'utf8');
const checkout=await readFile(new URL('../pages/checkout.jsx',import.meta.url),'utf8');

test('loja publica políticas comerciais acessíveis pelo rodapé',()=>{
  for(const route of ['/privacidade','/termos','/trocas-e-devolucoes']){
    assert.match(main,new RegExp(`path="${route}"`));
    assert.match(store,new RegExp(`href="${route}"`));
    assert.match(legal,new RegExp(`'${route}'`));
  }
});

test('checkout exige aceite explícito antes de criar o pedido',()=>{
  assert.match(checkout,/accepted_terms:false/);
  assert.match(checkout,/if\(!form\.accepted_terms\)return setError/);
  assert.match(checkout,/termos de compra/);
  assert.match(checkout,/política de privacidade/);
});

test('política informa tratamento de dados, pagamento, entrega e suporte',()=>{
  for(const text of ['Dados utilizados','Não armazenamos os dados completos do seu cartão','Preço e pagamento','Entrega','Como solicitar','Contato'])assert.match(legal,new RegExp(text));
  assert.match(legal,/settings\.support_email\|\|settings\.whatsapp/);
});
