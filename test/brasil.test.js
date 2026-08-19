import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidCnpj, isValidCpf, isValidDocument, isValidPhone, maskDocument } from '../lib/brasil.js';

test('valida CPF e rejeita sequências repetidas',()=>{
  assert.equal(isValidCpf('529.982.247-25'),true);
  assert.equal(isValidCpf('111.111.111-11'),false);
  assert.equal(isValidCpf('529.982.247-24'),false);
});

test('valida CNPJ e seleciona o algoritmo pelo tamanho',()=>{
  assert.equal(isValidCnpj('04.252.011/0001-10'),true);
  assert.equal(isValidCnpj('00.000.000/0000-00'),false);
  assert.equal(isValidDocument(maskDocument('04252011000110')),true);
  assert.equal(isValidDocument('123'),false);
});

test('valida telefone brasileiro com DDD',()=>{
  assert.equal(isValidPhone('(11) 99876-5432'),true);
  assert.equal(isValidPhone('(11) 3456-7890'),true);
  assert.equal(isValidPhone('11111111111'),false);
  assert.equal(isValidPhone('12345'),false);
});
