import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../lib/firebase.mjs';
import { readConfig } from '../lib/config.mjs';

const config = readConfig({});
const request = { headers: { authorization: 'Bearer test-token' } };

for (const code of [
  'auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
  'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
]) {
  test(`rejects an invalid session: ${code}`, async () => {
    await assert.rejects(authenticate(request, {
      verify: async () => { throw Object.assign(new Error('SDK error'), { code }); },
    }, config), { status: 401, code: 'TOKEN_EXPIRED' });
  });
}

for (const code of ['app/invalid-credential', 'auth/invalid-credential', 'auth/internal-error', undefined]) {
  test(`reports verification service failure without blaming the session: ${code}`, async () => {
    await assert.rejects(authenticate(request, {
      verify: async () => { throw Object.assign(new Error('Private credential details'), { code }); },
    }, config), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'AUTH_UNAVAILABLE');
      assert.doesNotMatch(error.message, /expired|Private credential details/);
      return true;
    });
  });
}
