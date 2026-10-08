import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const file=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const [header,footer,login,portal,account,returns,db,migration,pixMigration,payment,checkout,integrations]=await Promise.all([
 'components/CommerceHeader.jsx','components/CommerceFooter.jsx','pages/login.jsx',
 'components/CustomerPortalShell.jsx','pages/minha-conta.jsx','components/CustomerReturns.jsx',
 'lib/supabase.js','supabase/migrations/043_customer_self_service_returns.sql',
 'supabase/migrations/044_stripe_pix_opt_in.sql','api/payments/create.js','pages/checkout.jsx',
 'components/IntegrationHub.jsx'
].map(file));

test('atalho da equipe fica disponível na loja e exige a autenticação existente',()=>{
 assert.ok(header.includes('Acesso Admin'));
 assert.ok(header.includes("'/login?next=/admin'"));
 assert.ok(footer.includes('/login?next=/admin'));
 assert.ok(login.includes("router.query.next==='/admin'"));
 assert.ok(login.includes("!['admin','manager'].includes(profile?.role)"));
 assert.ok(header.includes("teamRole==='cashier'"));
});

test('cliente cria a própria devolução sem privilégios administrativos',()=>{
 assert.ok(portal.includes('secao=trocas'));
 assert.ok(account.includes('<CustomerReturns orders={orders}/>'));
 assert.ok(returns.includes('db.requestMyOrderReturn('));
 assert.ok(returns.includes('db.myOrderReturns()'));
 assert.ok(db.includes('/rest/v1/rpc/request_my_order_return'));
 assert.match(migration,/customer_id=auth\.uid\(\)/);
 assert.match(migration,/source_item\.id is null/);
 assert.match(migration,/order_return_items ri/);
 assert.match(migration,/customer_notifications/);
 assert.match(migration,/revoke all on function public\.request_my_order_return/);
 assert.match(migration,/grant execute on function public\.request_my_order_return.*to authenticated/);
});

test('Pix Stripe só é anunciado se ativado e elegível; não é ligado pela migração',()=>{
 assert.match(pixMigration,/stripe_pix_enabled boolean not null default false/);
 assert.match(pixMigration,/store_config\.stripe_pix_enabled/);
 assert.ok(payment.includes("order.payment_method==='pix'?'pix':'card'"));
 assert.ok(payment.includes("provider==='stripe'&&settings.stripe_enabled&&settings.stripe_pix_enabled"));
 assert.ok(checkout.includes('settings.stripe_pix_enabled'));
 assert.ok(integrations.includes('settings.stripe_pix_enabled'));
 assert.ok(integrations.includes('após confirmar que a sua conta Stripe está habilitada'));
});
