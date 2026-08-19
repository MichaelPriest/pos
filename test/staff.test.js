import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStaffPayload } from '../api/admin/staff.js';

test('normaliza um cadastro profissional válido',()=>{
  const result=validateStaffPayload({name:'  Maria da Silva ',email:' MARIA@EXAMPLE.COM ',password:'senha-forte',role:'cashier',salary:'2500.50'});
  assert.equal(result.name,'Maria da Silva');
  assert.equal(result.email,'maria@example.com');
  assert.equal(result.salary,2500.5);
});

test('rejeita dados funcionais e permissões inválidas',()=>{
  assert.throws(()=>validateStaffPayload({name:'A',email:'x',password:'123',role:'owner'}),/nome completo/);
  assert.throws(()=>validateStaffPayload({name:'Maria Silva',email:'email-invalido',password:'senha-forte',role:'cashier'}),/e-mail/);
  assert.throws(()=>validateStaffPayload({name:'Maria Silva',email:'maria@example.com',password:'123',role:'cashier'}),/senha temporária/);
  assert.throws(()=>validateStaffPayload({name:'Maria Silva',email:'maria@example.com',password:'senha-forte',role:'owner'}),/Nível de acesso/);
});
