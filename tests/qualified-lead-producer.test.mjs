import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { produceQualifiedLeadSnapshot } from '../.claude/skills/lead-attribution-feedback/scripts/qualified-lead-producer.mjs';
import { qualifiedLeadWindow } from '../.claude/skills/lead-attribution-feedback/scripts/qualified-lead-feedback.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = new Date('2026-09-18T03:00:00.000Z');

async function fixture(t, rows) {
  const root = resolve(REPO, `.ai-manager-data/qualified-producer-${process.pid}-${Date.now()}-${Math.random()}`);
  const runtimeRoot = join(root, 'runtime');
  const dataRoot = join(runtimeRoot, 'data');
  const configRoot = join(runtimeRoot, 'config');
  await mkdir(dataRoot, { recursive: true });
  await mkdir(configRoot, { recursive: true });
  const sourceFile = join(dataRoot, 'qualified-private-source.json');
  const outputFile = join(dataRoot, 'qualified-leads.json');
  const keyFile = join(configRoot, 'qualified-lead-hmac.key');
  const window = qualifiedLeadWindow(NOW);
  await writeFile(sourceFile, JSON.stringify({
    schemaVersion: 1,
    accountId: '2514971872',
    boardId: '2732725332',
    observedAt: NOW.toISOString(),
    evidenceRef: 'qualified.crm.20260918',
    sourceMode: 'approved_private_crm_export',
    windowStart: window.start,
    windowEnd: window.end,
    expectedRows: rows.length,
    paginationComplete: true,
    crossHistoryDedupVerified: true,
    rows,
  }), 'utf8');
  await writeFile(keyFile, Buffer.alloc(32, 7));
  const configPath = join(configRoot, 'config.json');
  await writeFile(configPath, JSON.stringify({
    maturity: 0,
    runtimeRoot,
    googleAdsAccountId: '251-497-1872',
    mondayBoardId: '2732725332',
    connections: {
      qualifiedLeads: {
        readOnly: true,
        externalWritesAllowed: false,
        sourceFile,
        outputFile,
        identityHmacCredentialFile: keyFile,
      },
    },
  }), 'utf8');
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe qualified producer fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  return { configPath, outputFile };
}

function row(overrides = {}) {
  return {
    mondayItemId: '1001',
    identity: { type: 'email', value: 'Synthetic.Person@Example.invalid' },
    acquiredDate: '2026-09-17',
    kind: 'NEW_LEAD',
    qualification: 'QUALIFIED',
    contactValidated: true,
    platform: 'google_ads',
    campaignId: '123456789',
    attributionMethod: 'click_id',
    ...overrides,
  };
}

test('qualified lead producer hashes identity locally and emits only the strict safe snapshot', async (t) => {
  const { configPath, outputFile } = await fixture(t, [row()]);
  const result = await produceQualifiedLeadSnapshot({ configPath, now: NOW });
  assert.equal(result.mode, 'LOCAL_PRIVATE_PRODUCER');
  assert.equal(result.status, 'BELOW_TARGET');
  assert.equal(result.records, 1);
  assert.equal(JSON.stringify(result).includes('Synthetic.Person'), false);
  assert.deepEqual(result.safety, {
    mondayWrites: 0,
    platformWrites: 0,
    externalSends: 0,
    rawPiiOutput: false,
    secretsOutput: false,
    localFilesWritten: 1,
  });
  const saved = JSON.parse(await readFile(outputFile, 'utf8'));
  assert.match(saved.rows[0].leadKey, /^[a-f0-9]{64}$/);
  assert.equal(saved.rows[0].identity, undefined);
  assert.equal(JSON.stringify(saved).includes('Synthetic.Person'), false);
  assert.equal(saved.sourceMode, 'verified_crm_qualification');
});

test('qualified lead producer preserves unknown business evidence as a blocker', async (t) => {
  const { configPath, outputFile } = await fixture(t, [row({
    kind: 'UNKNOWN',
    qualification: 'UNKNOWN',
    contactValidated: null,
    platform: 'unknown',
    campaignId: null,
    attributionMethod: 'unknown',
  })]);
  const result = await produceQualifiedLeadSnapshot({ configPath, now: NOW });
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.blockers.includes('ACQUISITION_CLASSIFICATION_REQUIRED'));
  const saved = JSON.parse(await readFile(outputFile, 'utf8'));
  assert.equal(saved.rows[0].kind, 'UNKNOWN');
});

test('qualified lead producer rejects stale or incomplete source evidence', async (t) => {
  const { configPath } = await fixture(t, [row()]);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const source = JSON.parse(await readFile(config.connections.qualifiedLeads.sourceFile, 'utf8'));
  source.paginationComplete = false;
  await writeFile(config.connections.qualifiedLeads.sourceFile, JSON.stringify(source), 'utf8');
  await assert.rejects(
    produceQualifiedLeadSnapshot({ configPath, now: NOW }),
    /private source provenance is invalid/,
  );
});
