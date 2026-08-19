import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const guard = readFileSync(new URL('../scripts/check-merge-integrity.mjs', import.meta.url), 'utf8');
const legacy = [
  'next.config.mjs','jsconfig.json','package-lock.json','pages/_app.js','pages/_document.js',
  'pages/index.js','pages/configuracoes.js','pages/api/hello.js','public/styles.css',
  'styles/Home.module.css','styles/globals.css',
];

test('artefatos antigos do Next.js permanecem removidos', () => {
  for (const file of legacy) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
});

test('verificação de merge protege a limpeza dos arquivos legados', () => {
  for (const file of legacy) assert.match(guard, new RegExp(file.replaceAll('.', '\\.')));
});
