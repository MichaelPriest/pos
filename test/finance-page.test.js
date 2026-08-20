import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page=readFileSync(new URL('../pages/financeiro.jsx',import.meta.url),'utf8');
test('financeiro possui filtros combináveis e estado vazio',()=>{assert.match(page,/setQuery/);assert.match(page,/setType/);assert.match(page,/setStatus/);assert.match(page,/Nenhum lançamento encontrado/)});
test('financeiro destaca vencidos e permite baixa segura',()=>{assert.match(page,/overdue-row/);assert.match(page,/Dar baixa/);assert.match(page,/setSaving/);assert.match(page,/catch\(error\)/)});
test('financeiro exporta somente os lançamentos filtrados',()=>{assert.match(page,/Exportar lançamentos/);assert.match(page,/\.\.\.filtered\.map/);assert.match(page,/text\/csv/)});
