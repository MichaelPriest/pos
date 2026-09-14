import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercel=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const vite=await readFile(new URL('../vite.config.mjs',import.meta.url),'utf8');
const headers=Object.fromEntries(vercel.headers[0].headers.map(({key,value})=>[key,value]));

test('deploy envia cabeçalhos essenciais de segurança',()=>{
  assert.match(headers['Strict-Transport-Security'],/includeSubDomains/);
  assert.equal(headers['X-Frame-Options'],'DENY');
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  assert.equal(headers['Cross-Origin-Opener-Policy'],'same-origin');
  assert.match(headers['Permissions-Policy'],/payment=\(\)/);
});

test('CSP bloqueia código arbitrário e permite apenas serviços usados pelo cliente',()=>{
  const csp=headers['Content-Security-Policy'];
  assert.match(csp,/default-src 'self'/);
  assert.match(csp,/script-src 'self'/);
  assert.match(csp,/object-src 'none'/);
  assert.match(csp,/frame-ancestors 'none'/);
  assert.match(csp,/https:\/\/\*\.supabase\.co/);
  assert.match(csp,/https:\/\/brasilapi\.com\.br/);
  assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);
});

test('build de produção não publica source maps',()=>{
  assert.match(vite,/sourcemap: mode !== 'production'/);
});
