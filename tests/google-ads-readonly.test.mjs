import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  GOOGLE_ADS_API_VERSION,
  assertReadOnlyGaql,
  collectGoogleAdsReadOnly,
  createServiceAccountAssertion,
} from '../.claude/skills/google-ads-manager/scripts/google-ads-readonly.mjs';

const REPO = resolve(import.meta.dirname, '..');
let fixtureCounter = 0;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

async function fixture(t) {
  fixtureCounter += 1;
  const root = resolve(REPO, `.ai-manager-data/google-ads-readonly-${process.pid}-${fixtureCounter}`);
  await mkdir(root, { recursive: true });
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe Google Ads fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccountPath = join(root, 'service-account.json');
  const developerCredentialPath = join(root, 'developer-credential.txt');
  const configPath = join(root, 'config.json');
  await writeFile(serviceAccountPath, JSON.stringify({
    type: 'service_account',
    project_id: 'synthetic-project',
    private_key_id: 'synthetic-key-id',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    client_email: 'synthetic-reader@synthetic-project.iam.gserviceaccount.com',
  }), 'utf8');
  await writeFile(developerCredentialPath, 'synthetic_dev_credential_123\n', 'utf8');
  await writeFile(configPath, JSON.stringify({
    maturity: 0,
    googleAdsAccountId: '251-497-1872',
    connections: {
      googleAds: {
        connected: false,
        liveVerified: false,
        readOnly: true,
        apiVersion: GOOGLE_ADS_API_VERSION,
        serviceAccountCredentialFile: serviceAccountPath,
        developerCredentialFile: developerCredentialPath,
      },
    },
  }), 'utf8');
  return { configPath };
}

test('service-account assertion contains bounded Google Ads claims without impersonation', async (t) => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const assertion = createServiceAccountAssertion({
    type: 'service_account',
    client_email: 'synthetic-reader@example.invalid',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }, new Date('2026-08-21T06:00:00.000Z'));
  const [, encodedClaims] = assertion.split('.');
  const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
  assert.equal(claims.iss, 'synthetic-reader@example.invalid');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/adwords');
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal('sub' in claims, false);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(t.name.length > 0, true);
});

test('Google Ads collector uses only accessible-customer and SearchStream reads', async (t) => {
  const { configPath } = await fixture(t);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method, headers: options.headers, body: options.body });
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.method, 'POST');
      assert.equal(String(options.body).includes('assertion='), true);
      return jsonResponse({ access_token: 'synthetic-access-token' });
    }
    if (String(url).endsWith('/customers:listAccessibleCustomers')) {
      assert.equal(options.method, 'GET');
      return jsonResponse({ resourceNames: ['customers/2514971872'] });
    }
    const query = JSON.parse(options.body).query;
    assertReadOnlyGaql(query);
    if (/FROM customer\b/i.test(query)) return jsonResponse([{ results: [{
      customer: { id: '2514971872', descriptiveName: 'Synthetic account', currencyCode: 'ILS', timeZone: 'Asia/Jerusalem' },
      metrics: { impressions: '100', clicks: '10', costMicros: '12500000', conversions: 2, allConversions: 3 },
    }] }]);
    if (/FROM campaign\b/i.test(query)) return jsonResponse([{ results: [{
      campaign: { id: '10', name: 'Synthetic campaign', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
      metrics: { impressions: '100', clicks: '10', costMicros: '12500000', conversions: 2, allConversions: 3 },
    }] }]);
    if (/FROM search_term_view\b/i.test(query)) return jsonResponse([{ results: [{
      searchTermView: { searchTerm: 'synthetic query' },
      campaign: { id: '10', name: 'Synthetic campaign' },
      adGroup: { id: '20', name: 'Synthetic ad group' },
      metrics: { impressions: '20', clicks: '4', costMicros: '5000000', conversions: 1 },
    }] }]);
    throw new Error(`Unexpected test URL: ${url}`);
  };

  const result = await collectGoogleAdsReadOnly({
    configPath,
    fetchImpl,
    now: new Date('2026-08-21T06:00:00.000Z'),
  });
  assert.equal(result.connection.status, 'CONNECTED_READ_ONLY');
  assert.equal(result.connection.accountId, '2514971872');
  assert.equal(result.account.currencyCode, 'ILS');
  assert.equal(result.account.metrics.spend, 12.5);
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.searchTerms.length, 1);
  assert.equal(result.safety.mutationMethodsAvailable, false);
  assert.equal(result.safety.platformWrites, 0);
  assert.equal(calls.filter(({ url }) => url.includes('googleads.googleapis.com')).length, 4);
  assert.equal(calls.some(({ url }) => /mutate/i.test(url)), false);
  for (const call of calls.filter(({ url }) => url.includes('googleads.googleapis.com'))) {
    assert.equal(call.headers.authorization, 'Bearer synthetic-access-token');
    assert.equal(typeof call.headers['developer-token'], 'string');
  }
});

test('Google Ads guardrail rejects mutating GAQL and wrong accounts', async (t) => {
  assert.throws(() => assertReadOnlyGaql('UPDATE campaign SET status = PAUSED'), /read-only/i);
  assert.throws(() => assertReadOnlyGaql('SELECT campaign.id FROM campaign DELETE'), /forbidden/i);

  const { configPath } = await fixture(t);
  const config = JSON.parse(await (await import('node:fs/promises')).readFile(configPath, 'utf8'));
  config.googleAdsAccountId = '000-000-0000';
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  await assert.rejects(() => collectGoogleAdsReadOnly({ configPath, fetchImpl: async () => {
    throw new Error('network must not be reached');
  } }), /account mismatch/i);
});
