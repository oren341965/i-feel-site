#!/usr/bin/env node

import { createHmac } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateQualifiedLeadFeedback, qualifiedLeadWindow } from './qualified-lead-feedback.mjs';

const EXPECTED_ACCOUNT_ID = '2514971872';
const EXPECTED_BOARD_ID = '2732725332';
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const SOURCE_FIELDS = ['schemaVersion', 'accountId', 'boardId', 'observedAt', 'evidenceRef',
  'sourceMode', 'windowStart', 'windowEnd', 'expectedRows', 'paginationComplete',
  'crossHistoryDedupVerified', 'rows'];
const SOURCE_ROW_FIELDS = ['mondayItemId', 'identity', 'acquiredDate', 'kind', 'qualification',
  'contactValidated', 'platform', 'campaignId', 'attributionMethod'];
const IDENTITY_FIELDS = ['type', 'value'];
const KINDS = ['NEW_LEAD', 'EXISTING_CUSTOMER', 'SERVICE', 'PROJECT', 'UNKNOWN'];
const QUALIFICATIONS = ['QUALIFIED', 'DISQUALIFIED', 'UNKNOWN'];
const PLATFORMS = ['google_ads', 'meta_ads', 'organic', 'referral', 'direct', 'other', 'unknown'];
const ATTRIBUTION_METHODS = ['click_id', 'verified_manual', 'unknown'];

function exact(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function isInside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function normalizeIdentity(identity) {
  if (!exact(identity, IDENTITY_FIELDS) || !['email', 'phone'].includes(identity.type)
    || typeof identity.value !== 'string') throw new Error('Qualified lead identity is invalid');
  if (identity.type === 'email') {
    const email = identity.value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Qualified lead email identity is invalid');
    }
    return `email:${email}`;
  }
  let phone = identity.value.replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = `972${phone.slice(1)}`;
  if (!/^\d{9,15}$/.test(phone)) throw new Error('Qualified lead phone identity is invalid');
  return `phone:${phone}`;
}

function validateSource(source, now) {
  const window = qualifiedLeadWindow(now);
  if (!exact(source, SOURCE_FIELDS) || source.schemaVersion !== 1
    || source.accountId !== EXPECTED_ACCOUNT_ID || source.boardId !== EXPECTED_BOARD_ID
    || source.sourceMode !== 'approved_private_crm_export' || !timestamp(source.observedAt)
    || typeof source.evidenceRef !== 'string' || !/^[a-z][a-z0-9._:-]{3,119}$/.test(source.evidenceRef)
    || source.windowStart !== window.start || source.windowEnd !== window.end
    || !Number.isSafeInteger(source.expectedRows) || source.expectedRows < 0
    || source.paginationComplete !== true || source.crossHistoryDedupVerified !== true
    || !Array.isArray(source.rows) || source.expectedRows !== source.rows.length) {
    throw new Error('Qualified lead private source provenance is invalid');
  }
  const age = now.getTime() - Date.parse(source.observedAt);
  if (age < -300_000 || age > 86_400_000) throw new Error('Qualified lead private source is stale or future-dated');
  const itemIds = new Set();
  for (const row of source.rows) {
    if (!exact(row, SOURCE_ROW_FIELDS) || typeof row.mondayItemId !== 'string'
      || !/^\d{1,24}$/.test(row.mondayItemId) || itemIds.has(row.mondayItemId)
      || !date(row.acquiredDate) || row.acquiredDate < window.start || row.acquiredDate > window.end
      || !KINDS.includes(row.kind) || !QUALIFICATIONS.includes(row.qualification)
      || ![true, false, null].includes(row.contactValidated) || !PLATFORMS.includes(row.platform)
      || !(row.campaignId === null || (typeof row.campaignId === 'string' && /^\d+$/.test(row.campaignId)))
      || !ATTRIBUTION_METHODS.includes(row.attributionMethod)) {
      throw new Error('Qualified lead private source row is invalid');
    }
    normalizeIdentity(row.identity);
    itemIds.add(row.mondayItemId);
  }
  return window;
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--config' || !argv[1]) {
    throw new Error('Usage: qualified-lead-producer.mjs --config <runtime-config>');
  }
  return { configPath: resolve(argv[1]) };
}

export async function produceQualifiedLeadSnapshot({ configPath, now = new Date() } = {}) {
  const evidenceNow = new Date(now);
  if (Number.isNaN(evidenceNow.getTime())) throw new Error('Invalid qualified lead producer timestamp');
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  if (config.maturity !== 0 || String(config.googleAdsAccountId).replace(/-/g, '') !== EXPECTED_ACCOUNT_ID
    || String(config.mondayBoardId) !== EXPECTED_BOARD_ID) {
    throw new Error('Qualified lead producer account, board, or maturity mismatch');
  }
  const producer = config.connections?.qualifiedLeads;
  if (producer?.readOnly !== true || producer?.externalWritesAllowed !== false) {
    throw new Error('Qualified lead producer requires explicit local read-only configuration');
  }
  const runtimeRoot = resolve(config.runtimeRoot);
  const dataRoot = resolve(runtimeRoot, 'data');
  const stateRoot = resolve(runtimeRoot, 'state');
  const configRoot = resolve(runtimeRoot, 'config');
  const sourcePath = resolve(producer.sourceFile ?? '');
  const outputPath = resolve(producer.outputFile ?? '');
  const keyPath = resolve(producer.identityHmacCredentialFile ?? '');
  if ((!isInside(dataRoot, sourcePath) && !isInside(stateRoot, sourcePath))
    || (!isInside(dataRoot, outputPath) && !isInside(stateRoot, outputPath))
    || !isInside(configRoot, keyPath) || sourcePath === outputPath
    || !sourcePath.toLowerCase().endsWith('.json') || !outputPath.toLowerCase().endsWith('.json')) {
    throw new Error('Qualified lead producer paths are outside the approved private runtime');
  }
  const [sourceStat, keyStat] = await Promise.all([stat(sourcePath), stat(keyPath)]);
  if (!sourceStat.isFile() || sourceStat.size > MAX_SOURCE_BYTES) throw new Error('Qualified lead source is unavailable or too large');
  if (!keyStat.isFile() || keyStat.size < 32 || keyStat.size > 1024) throw new Error('Qualified lead HMAC key is unavailable or invalid');
  const [sourceText, key] = await Promise.all([readFile(sourcePath, 'utf8'), readFile(keyPath)]);
  const source = JSON.parse(sourceText);
  validateSource(source, evidenceNow);

  const rows = source.rows.map((row) => ({
    mondayItemId: row.mondayItemId,
    leadKey: createHmac('sha256', key).update(normalizeIdentity(row.identity), 'utf8').digest('hex'),
    acquiredDate: row.acquiredDate,
    kind: row.kind,
    qualification: row.qualification,
    contactValidated: row.contactValidated,
    platform: row.platform,
    campaignId: row.campaignId,
    attributionMethod: row.attributionMethod,
  }));
  key.fill(0);
  const snapshot = {
    schemaVersion: 1,
    accountId: EXPECTED_ACCOUNT_ID,
    boardId: EXPECTED_BOARD_ID,
    observedAt: new Date(source.observedAt).toISOString(),
    evidenceRef: source.evidenceRef,
    sourceMode: 'verified_crm_qualification',
    windowStart: source.windowStart,
    windowEnd: source.windowEnd,
    expectedRows: rows.length,
    paginationComplete: true,
    crossHistoryDedupVerified: true,
    rows,
  };
  const feedback = evaluateQualifiedLeadFeedback(snapshot, { now: evidenceNow });
  if (feedback.blockers.includes('QUALIFIED_FEEDBACK_MISSING_OR_INVALID')
    || feedback.blockers.includes('QUALIFIED_FEEDBACK_PROVENANCE_OR_WINDOW_INVALID')
    || feedback.blockers.includes('QUALIFIED_FEEDBACK_ROW_INVALID')) {
    throw new Error('Qualified lead output validation failed');
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.pending`;
  const backupPath = `${outputPath}.backup-${evidenceNow.toISOString().replace(/[:.]/g, '-')}`;
  let backupCreated = false;
  try {
    const current = await stat(outputPath);
    if (current.isFile()) {
      await copyFile(outputPath, backupPath);
      backupCreated = true;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  return {
    schemaVersion: 1,
    mode: 'LOCAL_PRIVATE_PRODUCER',
    status: feedback.status,
    observedAt: snapshot.observedAt,
    records: snapshot.rows.length,
    uniqueIdentities: feedback.uniqueIdentities ?? null,
    qualifiedCurrent: feedback.qualifiedCurrent ?? null,
    qualifiedPrevious: feedback.qualifiedPrevious ?? null,
    blockers: feedback.blockers,
    outputFile: basename(outputPath),
    backupFile: backupCreated ? basename(backupPath) : null,
    safety: {
      mondayWrites: 0,
      platformWrites: 0,
      externalSends: 0,
      rawPiiOutput: false,
      secretsOutput: false,
      localFilesWritten: backupCreated ? 2 : 1,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await produceQualifiedLeadSnapshot(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
