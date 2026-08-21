import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runEveningCloseDryRun } from '../.claude/skills/ai-sales-manager/scripts/evening-close.mjs';
import { runMorningDryRun } from '../.claude/skills/ai-sales-manager/scripts/morning-run.mjs';
import {
  DAILY_BRIEF_SECTIONS,
  GOOGLE_ADS_AUDIT_CHECKS,
  META_ADS_AUDIT_CHECKS,
  ORCHESTRATED_COMPONENTS,
  authorizeOperation,
  createJudgmentRequest,
  evaluateCapacity,
  evaluateJudgmentResponse,
  evaluateLiveConnection,
  findForbiddenDataKeys,
  mergeAttribution,
  orchestrateSalesSystem,
  validateBusMessage,
} from '../.claude/skills/ai-sales-manager/scripts/orchestrate-sales-system.mjs';
import {
  VAULT_RELATIVE_FOLDERS,
  buildMorningJudgmentRequest,
  prepareVault,
} from '../.claude/skills/ai-sales-manager/scripts/vault-runtime.mjs';

const REPO = resolve(import.meta.dirname, '..');
const NOW = '2026-08-21T06:10:00.000Z';
let fixtureCounter = 0;

async function createVaultRuntimeFixture(t, options = {}) {
  fixtureCounter += 1;
  const root = resolve(REPO, `.ai-manager-data/vault-v1-test-${process.pid}-${fixtureCounter}`);
  const runtimeRoot = join(root, 'runtime');
  const vaultRoot = join(root, 'vault');
  await mkdir(vaultRoot, { recursive: true });
  if (options.withObsidian !== false) await mkdir(join(vaultRoot, '.obsidian'), { recursive: true });
  await mkdir(join(runtimeRoot, 'config'), { recursive: true });
  const config = JSON.parse(await readFile(resolve(
    REPO,
    '.claude/skills/ai-sales-manager/runtime/config.example.json',
  ), 'utf8'));
  config.runtimeRoot = runtimeRoot;
  config.VAULT_ROOT = vaultRoot;
  const configPath = join(runtimeRoot, 'config', 'config.json');
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  t.after(async () => {
    const privateRoot = resolve(REPO, '.ai-manager-data');
    if (!root.startsWith(`${privateRoot}\\`) && !root.startsWith(`${privateRoot}/`)) {
      throw new Error('unsafe Vault fixture cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  return { config, configPath, root, runtimeRoot, vaultRoot };
}

function busMessage(overrides = {}) {
  return {
    id: 'message-0001',
    schemaVersion: 1,
    createdAt: '2026-08-21T06:00:00.000Z',
    source: 'codex',
    target: 'claude',
    type: 'judgment_request',
    payload: {
      caseReference: 'monday-item-123',
      question: 'Which revenue engine best fits the bounded facts?',
      facts: ['Source category is unknown', 'Planning stage was supplied'],
      approvalRequired: true,
      approvalStatus: 'pending',
    },
    ...overrides,
  };
}

test('v2 orchestration keeps the existing manager as parent and includes every required domain', () => {
  const availableSkills = ORCHESTRATED_COMPONENTS.map(({ name }) => name);
  const result = orchestrateSalesSystem({ availableSkills });

  assert.equal(result.mode, 'DRY_RUN');
  assert.equal(result.maturity, 0);
  assert.equal(result.components.find(({ name }) => name === 'ai-sales-manager').role, 'orchestrator');
  assert.equal(result.components.every(({ status }) => status === 'READY'), true);
  assert.deepEqual(result.dailyBriefSections, [...DAILY_BRIEF_SECTIONS]);
  for (const section of [
    'google_ads', 'meta_ads', 'daily_website_improvement', 'daily_seo',
    'project_video_and_social_reuse', 'maya_and_plans', 'referral_opportunities',
    'existing_customer_revenue', 'service_quality_signals', 'project_handoff_and_closeout',
  ]) assert.equal(result.dailyBriefSections.includes(section), true, section);
});

test('Google and Meta require verified live connections', () => {
  assert.equal(evaluateLiveConnection().status, 'CONNECTION_MISSING');
  assert.equal(evaluateLiveConnection({ connected: true, liveVerified: false }).status, 'CONNECTION_MISSING');
  assert.equal(evaluateLiveConnection({ connected: true, liveVerified: true }).status, 'CONNECTED_READ_ONLY');

  const result = orchestrateSalesSystem();
  assert.equal(result.connections.googleAds.status, 'CONNECTION_MISSING');
  assert.equal(result.connections.metaAds.status, 'CONNECTION_MISSING');
  assert.equal(result.connections.googleAds.accountId, '251-497-1872');
  assert.deepEqual(result.connections.googleAds.auditChecks, [...GOOGLE_ADS_AUDIT_CHECKS]);
  assert.deepEqual(result.connections.metaAds.auditChecks, [...META_ADS_AUDIT_CHECKS]);
  assert.equal(result.connections.googleAds.historicalReference.referenceOnly, true);
});

test('maturity 0 blocks all protected external operations', () => {
  const capacity = evaluateCapacity({
    plansToProposalBusinessDays: 2,
    activeUnownedLeads: 1,
    unownedLeadThreshold: 5,
  });
  for (const operation of [
    { externalWrite: true },
    { irreversible: true },
    { budgetChange: true },
    { mondayMutation: true },
  ]) {
    assert.deepEqual(authorizeOperation(operation, { maturity: 0, capacity }), {
      allowed: false,
      status: 'MATURITY_0_DRY_RUN',
    });
  }
});

test('capacity blocks budget growth for delay or too many unowned leads', () => {
  const delayed = evaluateCapacity({ plansToProposalBusinessDays: 8, activeUnownedLeads: 0 });
  assert.equal(delayed.status, 'CAPACITY_BLOCKED');
  assert.equal(delayed.budgetGrowthAllowed, false);

  const unowned = evaluateCapacity({
    plansToProposalBusinessDays: 2,
    activeUnownedLeads: 6,
    unownedLeadThreshold: 5,
  });
  assert.equal(unowned.status, 'CAPACITY_BLOCKED');
  assert.equal(unowned.budgetGrowthAllowed, false);
});

test('missing capacity threshold X is never guessed and forbids budget growth', () => {
  const capacity = evaluateCapacity({ plansToProposalBusinessDays: 2, activeUnownedLeads: 1 });
  assert.equal(capacity.status, 'CAPACITY_THRESHOLD_MISSING');
  assert.equal(capacity.thresholdMissing, true);
  assert.equal(capacity.budgetGrowthAllowed, false);
  assert.equal('guessedThreshold' in capacity, false);
});

test('Monday remains read-only and structurally untouched', () => {
  const result = orchestrateSalesSystem({
    mondayBoardId: '2732725332',
    requestedMondayStructuralChange: true,
  });
  assert.equal(result.monday.boardId, '2732725332');
  assert.equal(result.monday.structuralChangesAllowed, false);
  assert.equal(result.monday.enrichmentStoredExternally, true);
  assert.equal(result.preRunChecks.passed, false);
  assert.equal(result.preRunChecks.issues.includes('MONDAY_STRUCTURE_CHANGE_FORBIDDEN'), true);
});

test('attribution preserves first and last touch, human referrer, gclid and fbclid', () => {
  const merged = mergeAttribution({
    monday_item_id: '123',
    how_did_you_hear: 'architect referral',
    first_touch: 'referral',
    last_touch: 'organic',
    referrer: 'architect-network',
    gclid: 'gclid-first',
  }, {
    monday_item_id: '123',
    first_touch: 'meta',
    last_touch: 'meta-retargeting',
    referrer: 'facebook.com',
    gclid: '',
    fbclid: 'fbclid-later',
    utm_campaign: 'retargeting',
  });

  assert.equal(merged.first_touch, 'referral');
  assert.equal(merged.last_touch, 'meta-retargeting');
  assert.equal(merged.how_did_you_hear, 'architect referral');
  assert.equal(merged.referrer, 'architect-network');
  assert.equal(merged.gclid, 'gclid-first');
  assert.equal(merged.fbclid, 'fbclid-later');
});

test('Vault file bridge rejects duplicate and stale messages', () => {
  assert.equal(validateBusMessage(busMessage(), {
    now: NOW,
    seenIds: ['message-0001'],
  }).status, 'BUS_MESSAGE_DUPLICATE');

  assert.equal(validateBusMessage(busMessage({
    id: 'message-stale',
    createdAt: '2026-08-18T06:00:00.000Z',
  }), { now: NOW, maxAgeMinutes: 60 }).status, 'BUS_MESSAGE_STALE');

  assert.equal(validateBusMessage(busMessage(), { now: NOW }).status, 'BUS_MESSAGE_ACCEPTED');

  const runtimeResult = orchestrateSalesSystem();
  const runtimeMessage = buildMorningJudgmentRequest(runtimeResult, { now: '2026-08-20T06:00:00.000Z' });
  assert.equal(validateBusMessage(runtimeMessage, { now: '2026-08-21T07:00:00.000Z' }).status, 'BUS_MESSAGE_STALE');
});

test('approval-required operations cannot execute without approval', () => {
  const denied = authorizeOperation({ approvalRequired: true, approvalStatus: 'pending' }, {
    maturity: 1,
    capacity: { budgetGrowthAllowed: true },
  });
  assert.deepEqual(denied, { allowed: false, status: 'APPROVAL_REQUIRED' });

  const orchestrated = orchestrateSalesSystem({
    requestedOperations: [{ id: 'send-proposal', approvalRequired: true, approvalStatus: 'pending' }],
  });
  assert.deepEqual(orchestrated.operationDecisions[0], {
    id: 'send-proposal', allowed: false, status: 'APPROVAL_REQUIRED',
  });
});

test('daily website improvement is an explicit sales orchestration engine and NO_CHANGE is valid', () => {
  const result = orchestrateSalesSystem();
  assert.equal(result.dailyWebsiteImprovement.included, true);
  assert.equal(result.dailyWebsiteImprovement.resultContract, 'ONE_EVIDENCE_BACKED_IMPROVEMENT_OR_NO_CHANGE');
  assert.equal(result.dailyWebsiteImprovement.acceptedSalesFeedback.includes('qualified_lead_pages'), true);
  assert.equal(result.dailyWebsiteImprovement.acceptedSalesFeedback.includes('content_gaps'), true);
});

test('component registry has no duplicate skill and introduces only the three approved skills', () => {
  const names = ORCHESTRATED_COMPONENTS.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    ORCHESTRATED_COMPONENTS.filter(({ ownership }) => ownership === 'new-required').map(({ name }) => name),
    ['google-ads-manager', 'meta-ads-manager', 'lead-attribution-feedback'],
  );
  assert.equal(
    ORCHESTRATED_COMPONENTS.find(({ name }) => name === 'ai-sales-manager').ownership,
    'existing-local',
  );

  const result = orchestrateSalesSystem({ availableSkills: ['ai-sales-manager'] });
  assert.equal(result.components.find(({ name }) => name === 'service-revenue-audit').status, 'MISSING_LOCAL');
});

test('bus messages and runtime examples reject or omit secrets and raw PII', async () => {
  const forbiddenMessage = busMessage({
    id: 'message-pii',
    payload: { phone: 'synthetic', approvalRequired: false, approvalStatus: 'not_required' },
  });
  assert.equal(validateBusMessage(forbiddenMessage, { now: NOW }).status, 'BUS_MESSAGE_FORBIDDEN_DATA');
  const piiInFacts = busMessage({
    id: 'message-pii-facts',
    payload: {
      facts: ['Contact synthetic@example.invalid or 050-123-4567'],
      approvalRequired: false,
      approvalStatus: 'not_required',
    },
  });
  assert.equal(validateBusMessage(piiInFacts, { now: NOW }).status, 'BUS_MESSAGE_FORBIDDEN_DATA');

  const config = JSON.parse(await readFile(resolve(
    REPO,
    '.claude/skills/ai-sales-manager/runtime/config.example.json',
  ), 'utf8'));
  assert.deepEqual(findForbiddenDataKeys(config), []);
  const configText = JSON.stringify(config).toLowerCase();
  for (const forbidden of ['client_secret', 'access_token', 'password', 'customer@example']) {
    assert.equal(configText.includes(forbidden), false, forbidden);
  }

  const result = orchestrateSalesSystem({ customerName: 'Synthetic Customer', email: 'synthetic@example.invalid' });
  const resultText = JSON.stringify(result);
  assert.equal(resultText.includes('Synthetic Customer'), false);
  assert.equal(resultText.includes('synthetic@example.invalid'), false);
});

test('morning runtime activates the Vault, writes bounded artifacts, and stays dry-run only', async (t) => {
  const fixture = await createVaultRuntimeFixture(t);
  const morning = await runMorningDryRun({ configPath: fixture.configPath, now: NOW });
  assert.equal(morning.mode, 'DRY_RUN');
  assert.equal(morning.vault.status, 'READY');
  assert.equal(morning.vault.root, fixture.vaultRoot);
  assert.equal(morning.vault.obsidianDetected, true);
  assert.equal(morning.vault.busReady, true);
  assert.equal(morning.vault.writable, true);
  assert.equal(morning.vault.foldersChecked.length, VAULT_RELATIVE_FOLDERS.length);
  assert.equal(morning.postRunSelfCheck.externalActionsPerformed, false);
  assert.equal(morning.connections.googleAds.status, 'CONNECTION_MISSING');
  assert.equal(morning.connections.metaAds.status, 'CONNECTION_MISSING');
  assert.equal(morning.googleAdsReadOnly, null);
  assert.equal(morning.metaAdsReadOnly, null);
  assert.equal(morning.attributionReadOnly, null);
  assert.equal(morning.attribution.status, 'CONNECTION_MISSING');
  assert.equal(morning.mayaConnection.status, 'NOT_STARTED');
  assert.equal(morning.maya.status, 'NOT_STARTED');
  assert.equal(morning.claudeJudgment.status, 'WAITING_FOR_CLAUDE');
  assert.equal(morning.claudeJudgment.safety.executionAllowed, false);

  const state = JSON.parse(await readFile(morning.artifacts.stateFile, 'utf8'));
  assert.equal(state.schema_version, 1);
  assert.equal(state.vault_status, 'READY');
  assert.equal(state.attribution_status, 'CONNECTION_MISSING');
  assert.equal(state.last_request_id, 'morning-sales-judgment-2026-08-21');
  const log = JSON.parse(await readFile(morning.artifacts.logFile, 'utf8'));
  assert.equal(log.protected_actions.monday_write, false);
  assert.equal(log.protected_actions.external_send, false);
  assert.equal(log.protected_actions.google_meta_write, false);
  const request = JSON.parse(await readFile(morning.artifacts.toClaudeFile, 'utf8'));
  assert.deepEqual({
    schema_version: request.schema_version,
    source: request.source,
    type: request.type,
    dry_run: request.dry_run,
    approval_required: request.approval_required,
    max_age_hours: request.max_age_hours,
  }, {
    schema_version: 1,
    source: 'codex',
    type: 'MORNING_SALES_JUDGMENT_REQUEST',
    dry_run: true,
    approval_required: false,
    max_age_hours: 24,
  });
  assert.deepEqual(request.payload.judgment_items, []);

  const repeated = await runMorningDryRun({ configPath: fixture.configPath, now: NOW });
  assert.equal(repeated.artifacts.busFileCreated, false);
  assert.equal(repeated.artifacts.idempotentReuse, true);
  assert.equal((await readdir(join(fixture.vaultRoot, 'AI-Sales', '_bus', 'to-claude'))).length, 1);

  const evening = runEveningCloseDryRun({ processedMessageIds: ['message-0001'] });
  assert.equal(evening.mode, 'DRY_RUN');
  assert.equal(evening.stateWritePerformed, false);
  assert.equal(evening.archivePerformed, false);
  assert.equal(evening.vaultSnapshotWritten, false);
});

test('morning runtime includes verified Meta live-read evidence and keeps writes blocked', async (t) => {
  const fixture = await createVaultRuntimeFixture(t);
  fixture.config.connections.metaAds.connected = true;
  fixture.config.connections.metaAds.liveVerified = true;
  fixture.config.connections.metaAds.readOnly = true;
  await writeFile(fixture.configPath, JSON.stringify(fixture.config), 'utf8');
  let collectorCalls = 0;
  const morning = await runMorningDryRun({
    configPath: fixture.configPath,
    now: NOW,
    metaAdsCollector: async ({ configPath, now }) => {
      collectorCalls += 1;
      assert.equal(configPath, fixture.configPath);
      assert.equal(now.toISOString(), NOW);
      return {
        mode: 'READ_ONLY',
        connection: { status: 'CONNECTED_READ_ONLY', adAccountId: 'act_123' },
        insights: [{ spend: 10, actions: { lead: 1 } }],
        campaigns: [],
        adSets: [],
        ads: [],
        safety: { mutationMethodsAvailable: false, platformWrites: 0, budgetChanges: 0 },
      };
    },
  });
  assert.equal(collectorCalls, 1);
  assert.equal(morning.connections.metaAds.status, 'CONNECTED_READ_ONLY');
  assert.equal(morning.metaAdsReadOnly.insights[0].spend, 10);
  assert.equal(morning.postRunSelfCheck.externalActionsPerformed, false);
  assert.equal(morning.postRunSelfCheck.budgetChangesPerformed, false);
});

test('morning runtime includes verified Google Ads live-read evidence and keeps writes blocked', async (t) => {
  const fixture = await createVaultRuntimeFixture(t);
  fixture.config.connections.googleAds.connected = true;
  fixture.config.connections.googleAds.liveVerified = true;
  fixture.config.connections.googleAds.readOnly = true;
  await writeFile(fixture.configPath, JSON.stringify(fixture.config), 'utf8');
  let collectorCalls = 0;
  const morning = await runMorningDryRun({
    configPath: fixture.configPath,
    now: NOW,
    googleAdsCollector: async ({ configPath, now }) => {
      collectorCalls += 1;
      assert.equal(configPath, fixture.configPath);
      assert.equal(now.toISOString(), NOW);
      return {
        mode: 'READ_ONLY',
        connection: { status: 'CONNECTED_READ_ONLY', accountId: '2514971872' },
        account: { currencyCode: 'ILS', metrics: { spend: 12.5, conversions: 2 } },
        campaigns: [],
        searchTerms: [],
        safety: { mutationMethodsAvailable: false, platformWrites: 0, budgetChanges: 0 },
      };
    },
  });
  assert.equal(collectorCalls, 1);
  assert.equal(morning.connections.googleAds.status, 'CONNECTED_READ_ONLY');
  assert.equal(morning.googleAdsReadOnly.account.metrics.spend, 12.5);
  assert.equal(morning.maya.externalActionsAllowed, false);
  assert.equal(morning.postRunSelfCheck.externalActionsPerformed, false);
  assert.equal(morning.postRunSelfCheck.budgetChangesPerformed, false);
});

test('Vault validation reports MISSING or INVALID before writing', async (t) => {
  const missingRoot = resolve(REPO, `.ai-manager-data/missing-vault-${process.pid}-${Date.now()}`);
  const missing = await prepareVault({ VAULT_ROOT: missingRoot });
  assert.equal(missing.status, 'MISSING');
  assert.equal(missing.foldersCreated.length, 0);

  const fixture = await createVaultRuntimeFixture(t, { withObsidian: false });
  const invalid = await prepareVault(fixture.config);
  assert.equal(invalid.status, 'INVALID');
  assert.equal(invalid.reason, 'OBSIDIAN_MARKER_NOT_FOUND');
  assert.equal(invalid.foldersCreated.length, 0);
});

test('Claude phase A stays file-based with approval gating and no direct API', () => {
  const result = orchestrateSalesSystem();
  assert.equal(result.claudeBridge.phase, 'FILE_BRIDGE');
  assert.equal(result.claudeBridge.directApiEnabled, false);
  assert.equal(result.claudeBridge.approvalRule, 'EXECUTE_ONLY_WHEN_NOT_REQUIRED_OR_APPROVED');

  const request = createJudgmentRequest({
    id: 'judgment-0001',
    createdAt: NOW,
    caseReference: 'monday-item-123',
    question: 'Is this bounded case qualified?',
    facts: ['Synthetic aggregate fact'],
    approvalRequired: true,
  });
  assert.equal(request.type, 'judgment_request');
  assert.equal(request.payload.approvalStatus, 'pending');

  const pendingResponse = {
    ...busMessage({
      id: 'judgment-response-0001',
      source: 'claude',
      target: 'codex',
      type: 'judgment_response',
      correlationId: 'judgment-0001',
    }),
    payload: {
      decision: 'Synthetic recommendation',
      confidence: 0.8,
      approvalRequired: true,
      approvalStatus: 'pending',
    },
  };
  assert.deepEqual(evaluateJudgmentResponse(pendingResponse, {
    now: NOW,
    expectedCorrelationId: 'judgment-0001',
  }), { accepted: true, executable: false, status: 'APPROVAL_REQUIRED' });

  pendingResponse.payload.approvalStatus = 'approved';
  assert.deepEqual(evaluateJudgmentResponse(pendingResponse, {
    now: NOW,
    expectedCorrelationId: 'judgment-0001',
  }), { accepted: true, executable: true, status: 'JUDGMENT_RESPONSE_READY' });
});
