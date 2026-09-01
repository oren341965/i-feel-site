import { readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BOARD_ID = '3011387201';
const COLUMN_ID = 'person';
const SCHEMA_VERSION = 1;
const MAX_BATCH_SIZE = 20;
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const PRIVATE_ROOT = resolve(process.cwd(), '.ai-manager-data/service/tmp');
const ALLOWED_KINDS = new Set(['person', 'team']);

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function privatePath(file) {
  const target = resolve(file);
  const child = relative(PRIVATE_ROOT, target);
  if (!child || child.startsWith('..') || isAbsolute(child)) {
    throw new Error('All inputs and outputs must be inside .ai-manager-data/service/tmp');
  }
  return target;
}

function parseTimestamp(value, label) {
  const timestamp = new Date(value);
  if (!hasText(value) || Number.isNaN(timestamp.getTime())) throw new TypeError(`${label} must be a valid timestamp`);
  return timestamp;
}

function normalizeRef(value, label, { requireId = true } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const id = value.id === null || value.id === undefined ? null : String(value.id).trim();
  const kind = value.kind === null || value.kind === undefined ? null : String(value.kind).trim().toLowerCase();
  const name = String(value.name ?? value.displayName ?? '').trim();
  if (requireId && (!id || !/^\d+$/.test(id))) throw new TypeError(`${label}.id must be a numeric Monday identity`);
  if (requireId && !ALLOWED_KINDS.has(kind)) throw new TypeError(`${label}.kind must be person or team`);
  if (!name) throw new TypeError(`${label}.name is required for human review`);
  return { id, kind, name };
}

function assertCompleteLiveAnalysis(analysis, now, maxAgeMinutes) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new TypeError('analysis must be an object');
  if (String(analysis.boardId ?? '') !== BOARD_ID) throw new TypeError('analysis boardId mismatch');
  if (analysis.analysisComplete !== true || analysis.source?.mode !== 'live') {
    throw new Error('A complete live service analysis is required');
  }
  const reconciliationKeys = [
    'populationMatchesTotal', 'uniqueIdsMatchSourceRecords', 'analyzedCasesReconcile', 'prioritiesAreOpen',
  ];
  if (reconciliationKeys.some((key) => analysis.reconciliation?.[key] !== true)) {
    throw new Error('Live analysis reconciliation failed');
  }
  if (!Array.isArray(analysis.priorities)) throw new TypeError('analysis.priorities must be an array');
  const generatedAt = parseTimestamp(analysis.generatedAt, 'analysis.generatedAt');
  const ageMs = now.getTime() - generatedAt.getTime();
  if (ageMs < -5 * 60_000 || ageMs > maxAgeMinutes * 60_000) {
    throw new Error(`Live analysis is outside the ${maxAgeMinutes}-minute freshness window`);
  }
  return generatedAt;
}

function ownerRouting(decisions) {
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) throw new TypeError('decisions must be an object');
  if (decisions.schemaVersion !== SCHEMA_VERSION) throw new TypeError(`decisions.schemaVersion must be ${SCHEMA_VERSION}`);
  if (String(decisions.boardId ?? '') !== BOARD_ID) throw new TypeError('decisions boardId mismatch');
  const routing = decisions.ownerRouting?.noOwner;
  if (!routing) return null;
  const normalized = normalizeRef(routing, 'ownerRouting.noOwner');
  if (normalized.name === 'שירות לקוחות') {
    throw new TypeError('ownerRouting.noOwner must identify an accountable owner, not the generic service queue');
  }
  return normalized;
}

function exactCurrentRefs(row) {
  if (!Array.isArray(row.ownerRefs)) return null;
  const refs = [];
  for (let index = 0; index < row.ownerRefs.length; index += 1) {
    const ref = normalizeRef(row.ownerRefs[index], `priority.ownerRefs[${index}]`, { requireId: false });
    if (!ref.id || !/^\d+$/.test(ref.id) || !ALLOWED_KINDS.has(ref.kind)) return null;
    refs.push(ref);
  }
  return refs;
}

function mondayValue(refs) {
  return { personsAndTeams: refs.map(({ id, kind }) => ({ id: Number(id), kind })) };
}

export function buildServiceMondayChangePreview({ analysis, decisions, now = new Date(), maxItems = MAX_BATCH_SIZE }) {
  const observedNow = now instanceof Date ? new Date(now) : parseTimestamp(now, 'now');
  if (Number.isNaN(observedNow.getTime())) throw new TypeError('now must be a valid date');
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > MAX_BATCH_SIZE) {
    throw new RangeError(`maxItems must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  const maxAgeMinutes = Number(decisions?.maxAnalysisAgeMinutes ?? 60);
  if (!Number.isInteger(maxAgeMinutes) || maxAgeMinutes < 1 || maxAgeMinutes > 180) {
    throw new RangeError('maxAnalysisAgeMinutes must be between 1 and 180');
  }
  const analysisGeneratedAt = assertCompleteLiveAnalysis(analysis, observedNow, maxAgeMinutes);
  const route = ownerRouting(decisions);
  const proposals = [];
  const blocked = [];
  const seen = new Set();

  for (const row of analysis.priorities) {
    if (proposals.length >= maxItems) break;
    if (row?.flags?.noOwner !== true) continue;
    const itemId = String(row.id ?? '').trim();
    if (!/^\d+$/.test(itemId) || seen.has(itemId)) throw new Error('Priority item IDs must be numeric and unique');
    seen.add(itemId);
    if (!route) {
      blocked.push({ itemId, queue: 'noOwner', code: 'OWNER_ROUTING_MISSING' });
      continue;
    }
    const currentRefs = exactCurrentRefs(row);
    const knownBlank = Array.isArray(row.ownerRefs) && row.ownerRefs.length === 0 && Array.isArray(row.owners) && row.owners.length === 0;
    if (!currentRefs && !knownBlank) {
      blocked.push({ itemId, queue: 'noOwner', code: 'EXACT_ROLLBACK_VALUE_MISSING' });
      continue;
    }
    const effectiveCurrent = currentRefs ?? [];
    const proposedRefs = effectiveCurrent.some((ref) => ref.id === route.id && ref.kind === route.kind)
      ? effectiveCurrent : [...effectiveCurrent, route];
    proposals.push({
      sequence: proposals.length + 1,
      itemId,
      sourceKind: String(row.sourceKind ?? 'main'),
      parentId: row.parentId === null || row.parentId === undefined ? null : String(row.parentId),
      queue: 'noOwner',
      columnId: COLUMN_ID,
      currentValue: mondayValue(effectiveCurrent),
      proposedValue: mondayValue(proposedRefs),
      reviewLabel: { from: effectiveCurrent.map((ref) => ref.name), to: route.name },
      reasons: Array.isArray(row.reasons) ? row.reasons.map(String).slice(0, 10) : [],
      rollback: { columnId: COLUMN_ID, value: mondayValue(effectiveCurrent) },
      preconditions: [
        'fresh-live-readback-matches-currentValue',
        'explicit-approval-for-this-exact-batch',
        'post-write-readback-required',
      ],
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'review-only',
    boardId: BOARD_ID,
    generatedAt: observedNow.toISOString(),
    basedOn: {
      analysisGeneratedAt: analysisGeneratedAt.toISOString(),
      sourceMode: 'live',
      reconciliationComplete: true,
    },
    authorization: {
      mondayWriteAuthorized: false,
      executableClientIncluded: false,
      requiresExactBatchApproval: true,
    },
    limits: { maximum: MAX_BATCH_SIZE, selected: proposals.length },
    proposals,
    blocked,
    safeguards: {
      networkCalls: false,
      mondayMutations: false,
      customerNamesPersisted: false,
      overwriteAllowed: false,
    },
  };
}

function parseArgs(argv) {
  const args = { maxItems: MAX_BATCH_SIZE };
  const flags = new Set(['--analysis', '--decisions', '--output', '--max-items', '--now']);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flags.has(flag)) throw new Error(`Unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--analysis') args.analysis = value;
    if (flag === '--decisions') args.decisions = value;
    if (flag === '--output') args.output = value;
    if (flag === '--max-items') args.maxItems = Number(value);
    if (flag === '--now') args.now = value;
    index += 1;
  }
  if (!args.analysis || !args.decisions || !args.output) {
    throw new Error('Usage: plan-service-monday-changes.mjs --analysis <file> --decisions <file> --output <file> [--max-items 1-20] [--now <ISO>]');
  }
  return args;
}

async function readPrivateJson(file) {
  const path = privatePath(file);
  const metadata = await stat(path);
  if (metadata.size > MAX_INPUT_BYTES) throw new Error(`Input exceeds ${MAX_INPUT_BYTES} bytes`);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const analysis = await readPrivateJson(args.analysis);
  const decisions = await readPrivateJson(args.decisions);
  const preview = buildServiceMondayChangePreview({
    analysis,
    decisions,
    now: args.now ? parseTimestamp(args.now, 'now') : new Date(),
    maxItems: args.maxItems,
  });
  const output = privatePath(args.output);
  await writeFile(output, `${JSON.stringify(preview, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: preview.mode,
    proposalCount: preview.proposals.length,
    blockedCount: preview.blocked.length,
    mondayWriteAuthorized: false,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
