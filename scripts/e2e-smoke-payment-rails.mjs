#!/usr/bin/env node
const BASE_URL = process.env.KING_BACKEND_BASE_URL || 'https://king-backend.fly.dev';
const USER_ID = process.env.SMOKE_USER_ID || '8063432083';
const APPS = ['spreadhunter', 'rosterradar'];

async function getJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { ok: res.ok, status: res.status, body };
}

const report = { baseUrl: BASE_URL, userId: USER_ID, generatedAt: new Date().toISOString(), checks: [] };

const push = (name, result) => {
  report.checks.push({ name, ...result });
};

push('health', await getJson(`${BASE_URL}/health`));
push('contract.paymentRails', await getJson(`${BASE_URL}/api/contracts/payment-rails`));
push('contract.uiShells', await getJson(`${BASE_URL}/api/contracts/payment-rails/ui-shells`));

for (const app of APPS) {
  push(`${app}.payments.config`, await getJson(`${BASE_URL}/api/${app}/payments/config`));
  push(`${app}.payments.status`, await getJson(`${BASE_URL}/api/${app}/payments/status?userId=${encodeURIComponent(USER_ID)}`));
  push(`${app}.shell.entitlement`, await getJson(`${BASE_URL}/api/${app}/shell/entitlement-status?userId=${encodeURIComponent(USER_ID)}`));

  const checkoutUrl = `${BASE_URL}/api/payments/checkout?app=${app}&tier=basic&user=${encodeURIComponent(USER_ID)}`;
  push(`${app}.payments.checkout`, await getJson(checkoutUrl));
}

const failures = report.checks.filter(c => !c.ok).map(c => ({ name: c.name, status: c.status, body: c.body }));
report.summary = {
  total: report.checks.length,
  passed: report.checks.length - failures.length,
  failed: failures.length,
};
report.failures = failures;

console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 2 : 0);
