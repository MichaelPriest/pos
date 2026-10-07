import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

test('migrations numeradas permanecem únicas e sequenciais',async()=>{
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>/^\d{3}_.+\.sql$/.test(name)).sort();
  const numbers=files.map(name=>Number(name.slice(0,3)));
  assert.equal(new Set(numbers).size,numbers.length,'Há prefixos de migration duplicados.');
  for(let index=0;index<numbers.length;index++) assert.equal(numbers[index],index+1,`Migration fora de sequência: ${files[index]}`);
});

test('baseline bloqueia db push cego enquanto histórico remoto não existe',async()=>{
  const doc=await readFile(new URL('../supabase/MIGRATION_BASELINE.md',import.meta.url),'utf8');
  assert.match(doc,/não é seguro executar `supabase db push` em produção/i);
  assert.match(doc,/migration repair --status applied/i);
  assert.match(doc,/supabase migration list/i);
});
