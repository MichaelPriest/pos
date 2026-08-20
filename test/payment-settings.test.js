import assert from 'node:assert/strict';
import test from 'node:test';
import { decrypt, encrypt } from '../api/admin/payment-settings.js';

test('cofre cifra com AES-GCM e detecta adulteração',()=>{
  const previous=process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY='segredo-de-teste-com-comprimento-suficiente';
  try{
    const encrypted=encrypt('sk_test_valor_privado');
    assert.notEqual(encrypted,'sk_test_valor_privado');
    assert.equal(decrypt(encrypted),'sk_test_valor_privado');
    const parts=encrypted.split('.');parts[2]=parts[2].replace(/^./,parts[2][0]==='0'?'1':'0');
    assert.throws(()=>decrypt(parts.join('.')));
  }finally{if(previous===undefined)delete process.env.APP_ENCRYPTION_KEY;else process.env.APP_ENCRYPTION_KEY=previous}
});
