import assert from 'node:assert/strict';
import test from 'node:test';
import { healthStatus, productionChecks } from '../api/health.js';

test('resume a saúde dos serviços sem expor credenciais',()=>{
  assert.equal(healthStatus([{ok:true},{ok:true}]),'healthy');
  assert.equal(healthStatus([{ok:true},{ok:false}]),'degraded');
  assert.equal(healthStatus([{ok:false},{ok:false}]),'unavailable');
});

test('valida os requisitos mínimos do ambiente de produção',()=>{
  const env={SITE_URL:'https://loja.example.com',SUPABASE_SERVICE_ROLE_KEY:'service',APP_ENCRYPTION_KEY:'x'.repeat(32),CRON_SECRET:'c'.repeat(24),STRIPE_WEBHOOK_SECRET:'whsec_test'};
  const result=productionChecks(env,['stripe'],{stripe_enabled:true,mercadopago_enabled:false,pagbank_enabled:false,card_enabled:true,pix_enabled:false,maintenance_mode:false});
  assert.equal(result.checks.every(item=>item.ok),true);
  assert.deepEqual(result.services,{stripe:true,mercadopago:false,pagbank:false,webhook_signature:true});
});

test('rejeita origem insegura, segredos curtos e ausência de pagamento',()=>{
  const result=productionChecks({SITE_URL:'http://loja.example.com',APP_ENCRYPTION_KEY:'curta',CRON_SECRET:'curto'},[],{mercadopago_enabled:true,pix_enabled:true,maintenance_mode:true});
  assert.equal(result.checks.find(item=>item.name==='site_url').ok,false);
  assert.equal(result.checks.find(item=>item.name==='encryption_key').ok,false);
  assert.equal(result.checks.find(item=>item.name==='cron_secret').ok,false);
  assert.equal(result.checks.find(item=>item.name==='payment_provider').ok,false);
  assert.equal(result.checks.find(item=>item.name==='sales_enabled').ok,false);
});

test('não aprova credencial de um gateway diferente do habilitado',()=>{
  const env={SITE_URL:'https://loja.example.com',SUPABASE_SERVICE_ROLE_KEY:'service',APP_ENCRYPTION_KEY:'x'.repeat(32),CRON_SECRET:'c'.repeat(24),MERCADOPAGO_ACCESS_TOKEN:'token'};
  const result=productionChecks(env,[],{stripe_enabled:true,mercadopago_enabled:false,pagbank_enabled:false,card_enabled:true,pix_enabled:false,maintenance_mode:false});
  assert.equal(result.services.mercadopago,true);
  assert.equal(result.checks.find(item=>item.name==='payment_provider').ok,false);
});

test('logística é diagnóstica e só fica pronta para cliente em produção',()=>{
  const baseEnv={SITE_URL:'https://loja.example.com',SUPABASE_SERVICE_ROLE_KEY:'service',APP_ENCRYPTION_KEY:'x'.repeat(32),CRON_SECRET:'c'.repeat(24),STRIPE_WEBHOOK_SECRET:'whsec_test'};
  const common={stripe_enabled:true,card_enabled:true,pix_enabled:false,maintenance_mode:false,
    shipping_origin_name:'ReVeste',shipping_origin_email:'ops@example.com',shipping_origin_phone:'11999999999',
    shipping_origin_zip_code:'01001000',shipping_origin_street:'Rua A',shipping_origin_number:'1',
    shipping_origin_neighborhood:'Centro',shipping_origin_city:'São Paulo',shipping_origin_state:'SP',
    shipping_package_width:20,shipping_package_height:5,shipping_package_length:30,shipping_package_weight:0.5,
    shipping_document_mode:'declaration'};
  const sandbox=productionChecks(baseEnv,['stripe','melhorenvio'],{...common,melhorenvio_sandbox:true});
  assert.equal(sandbox.logistics.melhorenvio_configured,true);
  assert.equal(sandbox.logistics.customer_live_quotes_ready,false);
  assert.equal(sandbox.checks.every(item=>item.ok),true);
  const production=productionChecks(baseEnv,['stripe','melhorenvio'],{...common,melhorenvio_sandbox:false});
  assert.equal(production.logistics.customer_live_quotes_ready,true);
});
