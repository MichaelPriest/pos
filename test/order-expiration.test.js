import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedCron } from '../api/orders/expire.js';

test('autoriza somente o bearer token exato do agendamento', () => {
  assert.equal(isAuthorizedCron({ authorization:'Bearer segredo-forte' },'segredo-forte'),true);
  assert.equal(isAuthorizedCron({ authorization:'Bearer incorreto' },'segredo-forte'),false);
  assert.equal(isAuthorizedCron({},'segredo-forte'),false);
  assert.equal(isAuthorizedCron({ authorization:'Bearer segredo-forte' },''),false);
});
