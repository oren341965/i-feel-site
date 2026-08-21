import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  assertMetaReadOnlyPath,
  collectMetaAdsReadOnly,
} from '../.claude/skills/meta-ads-manager/scripts/meta-ads-readonly.mjs';

const REPO = resolve(import.meta.dirname, '..');
let fixtureCounter = 0;

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

async function fixture(t, overrides = {}) {
  fixtureCounter += 1;
  const root = resolve(REPO, `.ai-manager-data/meta-ads-readonly-${process.pid}-${fixtureCounter}`);
  await mkdir(root, { recursive: true });
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe Meta fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  const credentialPath = join(root, 'meta-credential.txt');
  const configPath = join(root, 'config.json');
  await writeFile(credentialPath, 'synthetic_meta_access_credential_1234567890\n', 'utf8');
  await writeFile(configPath, JSON.stringify({
    maturity: 0,
    connections: {
      metaAds: {
        connected: false,
        liveVerified: false,
        readOnly: true,
        apiVersion: 'v99.0',
        adAccountId: 'act_123456789',
        accessCredentialFile: credentialPath,
        ...overrides,
      },
    },
  }), 'utf8');
  return { configPath };
}

test('Meta collector uses only GET allowlisted reporting paths and keeps credentials out of URLs', async (t) => {
  const { configPath } = await fixture(t);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(options.method, 'GET');
    assert.equal(String(url).includes('access_token'), false);
    assert.match(options.headers.authorization, /^Bearer /);
    const path = new URL(url).pathname.replace('/v99.0', '');
    assertMetaReadOnlyPath(path);
    if (path === '/me/adaccounts') return response({ data: [{
      id: 'act_123456789', account_id: '123456789', name: 'Synthetic account',
      account_status: 1, currency: 'ILS', timezone_name: 'Asia/Jerusalem',
    }] });
    if (path.endsWith('/insights')) return response({ data: [{
      campaign_id: '10', campaign_name: 'Synthetic campaign', impressions: '100', reach: '80',
      frequency: '1.25', clicks: '10', spend: '25.50', cpc: '2.55', cpm: '255', ctr: '10',
      actions: [{ action_type: 'lead', value: '2' }],
    }] });
    if (path.endsWith('/campaigns')) return response({ data: [{ id: '10', name: 'Synthetic campaign' }] });
    if (path.endsWith('/adsets')) return response({ data: [{ id: '20', name: 'Synthetic ad set' }] });
    if (path.endsWith('/ads')) return response({ data: [{ id: '30', name: 'Synthetic ad' }] });
    throw new Error(`Unexpected Meta test path: ${path}`);
  };
  const result = await collectMetaAdsReadOnly({
    configPath,
    fetchImpl,
    now: new Date('2026-08-21T10:00:00.000Z'),
  });
  assert.equal(result.connection.status, 'CONNECTED_READ_ONLY');
  assert.equal(result.account.currency, 'ILS');
  assert.equal(result.insights[0].spend, 25.5);
  assert.equal(result.insights[0].actions.lead, 2);
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.adSets.length, 1);
  assert.equal(result.ads.length, 1);
  assert.equal(result.leadData.status, 'CONNECTION_MISSING');
  assert.equal(result.safety.platformWrites, 0);
  assert.equal(calls.length, 5);
});

test('Meta collector paginates by cursor without following credential-bearing next URLs', async (t) => {
  const { configPath } = await fixture(t);
  let accountPage = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/v99.0', '');
    if (path === '/me/adaccounts') {
      accountPage += 1;
      if (accountPage === 1) return response({
        data: [{ id: 'act_1' }],
        paging: {
          cursors: { after: 'safe-cursor' },
          next: 'https://graph.facebook.com/v99.0/me/adaccounts?access_token=must-not-be-followed',
        },
      });
      assert.equal(parsed.searchParams.get('after'), 'safe-cursor');
      return response({ data: [{ id: 'act_123456789', currency: 'ILS' }] });
    }
    return response({ data: [] });
  };
  const result = await collectMetaAdsReadOnly({ configPath, fetchImpl });
  assert.equal(accountPage, 2);
  assert.equal(result.connection.accessible, true);
});

test('Meta connector fails closed on missing version, wrong account format, and mutation paths', async (t) => {
  assert.doesNotThrow(() => assertMetaReadOnlyPath('/act_123/campaigns'));
  assert.throws(() => assertMetaReadOnlyPath('/act_wrong/campaigns'), /allowlist/i);
  assert.throws(() => assertMetaReadOnlyPath('/act_123/campaigns/delete'), /allowlist/i);

  const { configPath } = await fixture(t, { apiVersion: null });
  await assert.rejects(() => collectMetaAdsReadOnly({
    configPath,
    fetchImpl: async () => { throw new Error('network must not be reached'); },
  }), /version/i);
});
