import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { firebaseServices } from '../lib/firebase.mjs';

test('unconfigured Firebase does not request credentials', async () => {
  assert.deepEqual(await firebaseServices({firebaseReady:false}), {});
});

test('unreadable Admin credentials fail startup clearly before listening', () => {
  const result=spawnSync(process.execPath, ['server.mjs'], {
    cwd:new URL('../', import.meta.url),
    env:{...process.env,
      GOOGLE_APPLICATION_CREDENTIALS:'/dev/null/missing-credentials.json',
      FIREBASE_API_KEY:'test', FIREBASE_AUTH_DOMAIN:'test.example',
      FIREBASE_PROJECT_ID:'test-project', FIREBASE_APP_ID:'test-app',
      FIREBASE_STORAGE_BUCKET:'test-bucket', LAUNCH_MODE:'private',
      RAZORPAY_KEY_ID:'',
    },
    encoding:'utf8', timeout:10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TurfKerala startup failed: Firebase Admin credentials/);
  assert.match(result.stderr, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.doesNotMatch(result.stdout, /TurfKerala: http/);
  assert.doesNotMatch(result.stderr, /googleauth\.js|MetadataLookupWarning/);
});
