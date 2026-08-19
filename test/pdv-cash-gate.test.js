import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pdv=readFileSync(new URL('../pages/pdv.jsx',import.meta.url),'utf8');
const layout=readFileSync(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');
test('PDV consulta e exibe o estado real do caixa',()=>{assert.match(pdv,/db\.cashSession\(\)/);assert.match(pdv,/cashExpected/);assert.match(pdv,/Caixa aberto/);assert.match(pdv,/Caixa fechado/)});
test('PDV fechado mantém a página e bloqueia a venda com modal acessível',()=>{assert.match(pdv,/cash===null&&/);assert.match(pdv,/role="dialog"/);assert.match(pdv,/aria-modal="true"/);assert.match(pdv,/Abrir caixa agora/)});
test('sidebar abre somente visão geral ou o grupo da rota atual',()=>{assert.match(layout,/Comercial'.*open:false/);assert.match(layout,/Operação'.*open:false/);assert.match(layout,/group\.links\.some/);assert.match(layout,/isCurrent\(to\)/)});
