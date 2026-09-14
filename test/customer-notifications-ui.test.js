import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const menu = await readFile(new URL('../components/UserMenu.jsx', import.meta.url), 'utf8');
const notifications = await readFile(new URL('../pages/notificacoes.jsx', import.meta.url), 'utf8');
const supabase = await readFile(new URL('../lib/supabase.js', import.meta.url), 'utf8');

test('menu do cliente consulta e anuncia notificações não lidas', () => {
  assert.match(supabase, /method:'HEAD'/);
  assert.match(supabase, /Prefer:'count=exact'/);
  assert.match(supabase, /content-range/);
  assert.match(supabase, /read_at=is\.null/);
  assert.match(menu, /user-notification-badge/);
  assert.match(menu, /aria-label={`\$\{unread\} notificações não lidas`}/);
});

test('contador é sincronizado após leitura e ao retornar para a página', () => {
  assert.match(menu, /addEventListener\('focus',refresh\)/);
  assert.match(menu, /setInterval\(refresh,60000\)/);
  assert.match(menu, /event\.detail\?\.unread/);
  assert.match(menu, /event\.detail\?\.delta/);
  assert.match(notifications, /new CustomEvent\('notifications:updated'/);
  assert.match(notifications, /delta:-Number\(changed\|\|0\)/);
  assert.match(notifications, /updateCounter\({unread:0}\)/);
});

test('menu de perfil pode ser fechado por Escape ou clique externo', () => {
  assert.match(menu, /event\.key==='Escape'/);
  assert.match(menu, /contains\(event\.target\)/);
  assert.match(menu, /aria-expanded={open}/);
});

test('ações de leitura bloqueiam envios duplicados e anunciam o resultado', () => {
  assert.match(notifications, /disabled={Boolean\(marking\)/);
  assert.match(notifications, /role="status" aria-live="polite"/);
  assert.match(notifications, /finally{setMarking\(null\)}/);
});


test('central pagina o histórico sem duplicar notificações', () => {
  assert.match(supabase, /limit=\$\{safeLimit\}&offset=\$\{safeOffset\}/);
  assert.match(notifications, /const PAGE_SIZE = 20/);
  assert.match(notifications, /offset:items.length/);
  assert.match(notifications, /rows.filter\(row=>!current.some\(item=>item.id===row.id\)\)/);
  assert.match(notifications, /Carregar notificações anteriores/);
});
