import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const layout=readFileSync(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');
const hr=readFileSync(new URL('../pages/rh.jsx',import.meta.url),'utf8');
test('sidebar global agrupa todos os módulos em menus recolhíveis',()=>{for(const group of ['Visão geral','Comercial','Operação','Pessoas','Administração'])assert.match(layout,new RegExp(group));assert.match(layout,/<details/);assert.match(layout,/<summary/)});
test('RH oferece pesquisa, filtros e exportação do quadro',()=>{assert.match(hr,/setQuery/);assert.match(hr,/setDepartment/);assert.match(hr,/setStatus/);assert.match(hr,/Exportar quadro/);assert.match(hr,/Abrir cadastro/)});
