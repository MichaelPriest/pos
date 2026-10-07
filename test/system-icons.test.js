import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const icon=await readFile(new URL('../components/SystemIcon.jsx',import.meta.url),'utf8');
const layout=await readFile(new URL('../src/components/SystemLayout.jsx',import.meta.url),'utf8');

test('navegação interna renderiza ícones SVG em vez de emojis como texto',()=>{
  assert.ok(layout.includes("import SystemIcon from '../../components/SystemIcon'"));
  assert.ok(layout.includes('<SystemIcon name={icon}/>'));
  assert.ok(layout.includes('<SystemIcon name={group.icon}/>'));
  assert.ok(layout.includes('<SystemIcon name="↗"/>'));
  assert.doesNotMatch(layout,/<i>\{icon\}<\/i>/);
});

test('conjunto SVG cobre todos os identificadores usados nos módulos',()=>{
  for(const token of ['🏠','🛍️','📦','🏷️','📥','👥','🧾','↩️','🚚','🎟️','⚙️','🛒','💵','💳','📊','📈','👤','💚','🧑‍💼','🗂️','⏱️','🛡️','🔌','↗','☰','×']){
    assert.ok(icon.includes("'"+token+"'"),token);
  }
  assert.ok(icon.includes("viewBox:'0 0 24 24'"));
  assert.ok(icon.includes("stroke:'currentColor'"));
  assert.ok(icon.includes("'aria-hidden':true"));
});
