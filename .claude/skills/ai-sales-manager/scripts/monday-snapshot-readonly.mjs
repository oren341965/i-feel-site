import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findForbiddenDataKeys } from './orchestrate-sales-system.mjs';

const EXPECTED_BOARD_ID = '2732725332';
const EXPECTED_SNAPSHOT_SCHEMA = 2;
const MAX_SNAPSHOT_BYTES = 1024 * 1024;
const REQUIRED_COUNTS = Object.freeze([
  'total',
  'open',
  'closed',
  'cancelled',
  'exceptionLeads',
  'overdue',
  'noNextAction',
  'noOwner',
  'inactive',
  'stale',
  'healthy',
]);
const REQUIRED_COVERAGE = Object.freeze([
  'status',
  'owner',
  'nextAction',
  'lastUpdated',
  'createdAt',
  'proposalValue',
]);
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'boardId',
  'generatedAt',
  'config',
  'configFingerprint',
  'analysisComplete',
  'counts',
  'healthScore',
  'dataQualityScore',
  'coverage',
  'openProposalValueCoverage',
]);

function parseArgs(argv) {
  let configPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config' && argv[index + 1]) {
      configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
  }
  if (!configPath) throw new Error('--config is required');
  return { configPath };
}

function finiteInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid Monday snapshot ${label}`);
  return value;
}

function boundedScore(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`Invalid Monday snapshot ${label}`);
  }
  return value;
}

function validateCoverageMetric(metric, expectedDenominator, label) {
  if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
    throw new Error(`Invalid Monday snapshot coverage: ${label}`);
  }
  const numerator = finiteInteger(metric.numerator, `${label}.numerator`);
  const denominator = finiteInteger(metric.denominator, `${label}.denominator`);
  if (denominator !== expectedDenominator || numerator > denominator) {
    throw new Error(`Monday snapshot coverage does not reconcile: ${label}`);
  }
  const expectedRate = denominator === 0 ? null : numerator / denominator;
  if (expectedRate === null ? metric.rate !== null : (
    typeof metric.rate !== 'number' || Math.abs(metric.rate - expectedRate) > Number.EPSILON * 8
  )) {
    throw new Error(`Monday snapshot coverage rate mismatch: ${label}`);
  }
  return { numerator, denominator, rate: expectedRate };
}

function assertSnapshotPath(runtimeRoot, snapshotFile) {
  if (typeof runtimeRoot !== 'string' || !isAbsolute(runtimeRoot)) {
    throw new Error('Runtime root must be an absolute path');
  }
  if (typeof snapshotFile !== 'string' || !isAbsolute(snapshotFile)) {
    throw new Error('Monday snapshot file must be an absolute path');
  }
  const stateRoot = resolve(runtimeRoot, 'state');
  const target = resolve(snapshotFile);
  const child = relative(stateRoot, target);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('Monday snapshot file must be inside the runtime state directory');
  }
  return target;
}

function validateSnapshot(snapshot, { now, maxAgeHours }) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Monday snapshot must be an object');
  }
  const extraKeys = Object.keys(snapshot).filter((key) => !ALLOWED_TOP_LEVEL_KEYS.has(key));
  if (extraKeys.length > 0) throw new Error(`Monday snapshot contains disallowed fields: ${extraKeys.join(', ')}`);
  const forbidden = findForbiddenDataKeys(snapshot);
  if (forbidden.length > 0) throw new Error('Monday snapshot contains forbidden PII or secret fields');
  if (snapshot.schemaVersion !== EXPECTED_SNAPSHOT_SCHEMA) throw new Error('Monday snapshot schema mismatch');
  if (String(snapshot.boardId ?? '') !== EXPECTED_BOARD_ID) throw new Error('Monday snapshot board mismatch');
  if (snapshot.analysisComplete !== true) throw new Error('Monday snapshot analysis is incomplete');

  const generatedAt = new Date(snapshot.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) throw new Error('Monday snapshot generatedAt is invalid');
  const evidenceNow = new Date(now ?? Date.now());
  if (Number.isNaN(evidenceNow.getTime())) throw new Error('Monday snapshot evidence time is invalid');
  const ageHours = (evidenceNow.getTime() - generatedAt.getTime()) / 3_600_000;
  if (ageHours < (-5 / 60)) throw new Error('Monday snapshot timestamp is in the future');
  if (ageHours > maxAgeHours) throw new Error('Monday snapshot is stale');

  const counts = Object.fromEntries(REQUIRED_COUNTS.map((key) => [
    key,
    finiteInteger(snapshot.counts?.[key], `counts.${key}`),
  ]));
  if (counts.open + counts.closed + counts.cancelled !== counts.total) {
    throw new Error('Monday snapshot population counts do not reconcile');
  }
  for (const key of ['exceptionLeads', 'overdue', 'noNextAction', 'noOwner', 'inactive', 'stale', 'healthy']) {
    if (counts[key] > counts.open) throw new Error(`Monday snapshot open count exceeds population: ${key}`);
  }
  if (counts.exceptionLeads + counts.healthy !== counts.open) {
    throw new Error('Monday snapshot healthy and exception counts do not reconcile');
  }

  const coverage = Object.fromEntries(REQUIRED_COVERAGE.map((key) => [
    key,
    validateCoverageMetric(snapshot.coverage?.[key], counts.total, key),
  ]));
  validateCoverageMetric(snapshot.openProposalValueCoverage, counts.open, 'openProposalValueCoverage');

  return {
    generatedAt: generatedAt.toISOString(),
    ageHours: Math.max(0, ageHours),
    counts,
    healthScore: boundedScore(snapshot.healthScore, 'healthScore'),
    dataQualityScore: boundedScore(snapshot.dataQualityScore, 'dataQualityScore'),
    coverage,
  };
}

export async function loadMondaySnapshotRuntimeConfig(configPath) {
  const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  if (config.maturity !== 0) throw new Error('Monday snapshot read is limited to maturity 0');
  if (String(config.mondayBoardId ?? '') !== EXPECTED_BOARD_ID) throw new Error('Monday board mismatch');
  const monday = config.connections?.monday ?? {};
  if (monday.readOnly !== true || monday.writesAllowed !== false || monday.structuralChangesAllowed !== false) {
    throw new Error('Monday snapshot requires explicit read-only configuration');
  }
  const maxAgeHours = Number(monday.snapshotMaxAgeHours ?? 168);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 24 * 365) {
    throw new Error('Invalid Monday snapshot max age');
  }
  return {
    config,
    snapshotFile: assertSnapshotPath(config.runtimeRoot, monday.snapshotFile),
    maxAgeHours,
  };
}

export async function collectMondaySnapshotReadOnly({ configPath, now = new Date() }) {
  const runtime = await loadMondaySnapshotRuntimeConfig(configPath);
  const snapshotStat = await stat(runtime.snapshotFile);
  if (!snapshotStat.isFile()) throw new Error('Monday snapshot path is not a file');
  if (snapshotStat.size > MAX_SNAPSHOT_BYTES) throw new Error('Monday snapshot exceeds the size limit');
  const snapshot = JSON.parse(await readFile(runtime.snapshotFile, 'utf8'));
  const validated = validateSnapshot(snapshot, { now, maxAgeHours: runtime.maxAgeHours });
  return {
    schemaVersion: 1,
    mode: 'READ_ONLY',
    maturity: 0,
    connection: {
      status: 'LOCAL_SNAPSHOT_READ_ONLY',
      boardId: EXPECTED_BOARD_ID,
      source: 'SANITIZED_AGGREGATE_SNAPSHOT',
      snapshotGeneratedAt: validated.generatedAt,
      evidenceTime: new Date(now).toISOString(),
      ageHours: Number(validated.ageHours.toFixed(3)),
      liveVerified: false,
    },
    counts: validated.counts,
    healthScore: validated.healthScore,
    dataQualityScore: validated.dataQualityScore,
    coverage: validated.coverage,
    safety: {
      aggregateOnly: true,
      containsOperationalRows: false,
      mondayReads: 0,
      mondayWrites: 0,
      structuralChanges: 0,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectMondaySnapshotReadOnly(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
