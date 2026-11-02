import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../lib/config.mjs';

// Local checks only: never print credentials or contact production services.
let missing = 0;
function report(ok, label, action, required = true) {
  console.log(`${ok ? 'OK' : required ? 'MISSING' : 'OPTIONAL'}  ${label}${ok ? '' : ` — ${action}`}`);
  if (!ok && required) missing++;
}
async function readable(path) {
  try { await access(path, constants.R_OK); return true; } catch { return false; }
}
console.log('TurfKerala local setup checks (service access is not verified)\n');
try {
  const c = readConfig();
  report(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22+', 'Install Node.js 22 or later.');
  report(c.firebaseReady, 'Firebase browser configuration', 'Fill the required FIREBASE_* values in .env.');
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const adcPath = join(process.env.CLOUDSDK_CONFIG || join(homedir(), '.config', 'gcloud'), 'application_default_credentials.json');
  report(await readable(credentials || adcPath), 'Local Admin credentials file',
    credentials ? 'GOOGLE_APPLICATION_CREDENTIALS points to an unreadable file.' : 'Set GOOGLE_APPLICATION_CREDENTIALS to your credentials file. Hosted workload identity is not checked here.');
  report(c.adminUids.length > 0 || c.adminPhones.length > 0, 'Administrator account', 'Set ADMIN_UIDS to the owner’s Firebase Authentication UID.');
  report(c.paymentsReady, 'Payment configuration', 'Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET.');
  report(Boolean(c.jobsSecret), 'Reconciliation scheduler token', 'Set JOBS_SECRET and schedule POST /api/jobs/reconcile.');
  report(Boolean(c.contact && c.legalName && c.refundPolicy), 'Business details', 'Set ADMIN_CONTACT_PHONE, BUSINESS_LEGAL_NAME and REFUND_POLICY_TEXT.');
  report(Boolean(c.mapsKey), 'Locality search', 'Set GOOGLE_MAPS_API_KEY to enable locality search.', false);
  report(Boolean(c.firebase.measurementId), 'Analytics configuration', 'Set FIREBASE_MEASUREMENT_ID if Analytics is wanted.', false);
  report(await readable('dist/app.js'), 'Browser build', 'Run npm run build.');
  console.log(`\n${missing ? `${missing} local setup items remain.` : 'Local setup values are present.'} Firebase provider settings, permissions, webhook delivery and live flows still require verification.`);
  process.exitCode = missing ? 1 : 0;
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exitCode = 1;
}
