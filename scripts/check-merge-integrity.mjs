import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding:'utf8' }).split('\0').filter(Boolean);
const textExtensions = new Set(['','.css','.env','.html','.js','.jsx','.json','.md','.mjs','.sql','.yml','.yaml']);
const conflicts = [];
for (const file of tracked) {
  if (!textExtensions.has(extname(file)) || !existsSync(file)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line,index) => {
    if (/^(<{7}|={7}|>{7})(?: |$)/.test(line)) conflicts.push(`${file}:${index+1}`);
  });
}

const legacyNextFiles = [
  'next.config.mjs','jsconfig.json','package-lock.json',
  'pages/_app.js','pages/_document.js','pages/index.js','pages/configuracoes.js',
  'pages/api/hello.js','pages/api/admin/payment-settings.js',
  'pages/api/payments/create.js','pages/api/payments/webhook.js',
  'public/styles.css','styles/Home.module.css','styles/globals.css',
];
const restoredLegacy = legacyNextFiles.filter(existsSync);
const trackedSet = new Set(tracked);
const shadowedModules = tracked
  .filter(file => file.endsWith('.jsx'))
  .map(file => file.slice(0,-1))
  .filter(file => trackedSet.has(file));

if (conflicts.length || restoredLegacy.length || shadowedModules.length) {
  if (conflicts.length) console.error(`Marcadores de conflito encontrados:\n- ${conflicts.join('\n- ')}`);
  if (restoredLegacy.length) console.error(`Arquivos legados do Next.js restaurados:\n- ${restoredLegacy.join('\n- ')}`);
  if (shadowedModules.length) console.error(`Módulos .js duplicam páginas/componentes .jsx:\n- ${shadowedModules.join('\n- ')}`);
  process.exit(1);
}
console.log(`Integridade do merge confirmada em ${tracked.length} arquivos rastreados.`);
