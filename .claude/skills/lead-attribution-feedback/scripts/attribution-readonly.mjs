import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ATTRIBUTION_FIELDS,
  findForbiddenDataKeys,
  mergeAttribution,
  normalizeAttribution,
} from '../../ai-sales-manager/scripts/orchestrate-sales-system.mjs';

const DEFAULT_CONFIG = fileURLToPath(new URL(
  '../../ai-sales-manager/runtime/config.example.json',
  import.meta.url,
));
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_ROW_FIELDS = new Set([
  ...ATTRIBUTION_FIELDS,
  'evidence_timestamp',
  'confidence',
]);
const SOURCE_FIELDS = Object.freeze([
  'how_did_you_hear',
  'first_touch',
  'last_touch',
  'referrer',
  'gclid',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'phone_source',
  'whatsapp_source',
]);

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function finiteNonNegative(value, label) {
  if (!hasValue(value)) return value;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number`);
  return number;
}

function booleanValue(value, label) {
  if (!hasValue(value)) return value;
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function timestamp(value, label) {
  const date = new Date(value);
  if (!hasValue(value) || Number.isNaN(date.getTime())) throw new Error(`${label} must be an ISO timestamp`);
  return date;
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function normalizeRow(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`rows[${index}] must be an object`);
  }
  const forbidden = findForbiddenDataKeys(row);
  if (forbidden.length > 0) throw new Error(`rows[${index}] contains forbidden PII: ${forbidden.join(', ')}`);
  const unknown = Object.keys(row).filter((key) => !ALLOWED_ROW_FIELDS.has(key));
  if (unknown.length > 0) throw new Error(`rows[${index}] has unknown fields: ${unknown.join(', ')}`);

  const mondayItemId = String(row.monday_item_id ?? '');
  if (!/^\d+$/.test(mondayItemId)) throw new Error(`rows[${index}].monday_item_id must contain digits only`);
  const evidenceAt = timestamp(row.evidence_timestamp, `rows[${index}].evidence_timestamp`);
  const confidence = String(row.confidence ?? '').toUpperCase();
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(confidence)) {
    throw new Error(`rows[${index}].confidence must be LOW, MEDIUM or HIGH`);
  }

  const normalized = normalizeAttribution({ ...row, monday_item_id: mondayItemId });
  for (const field of ['potential_value', 'revenue']) {
    if (hasValue(normalized[field])) normalized[field] = finiteNonNegative(normalized[field], `rows[${index}].${field}`);
  }
  for (const field of ['proposal', 'won']) {
    if (hasValue(normalized[field])) normalized[field] = booleanValue(normalized[field], `rows[${index}].${field}`);
  }
  for (const [field, value] of Object.entries(normalized)) {
    if (['potential_value', 'revenue', 'proposal', 'won'].includes(field)) continue;
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`rows[${index}].${field} must be a scalar value`);
    }
  }

  return {
    ...normalized,
    monday_item_id: mondayItemId,
    evidence_timestamp: evidenceAt.toISOString(),
    confidence,
    _source_index: index,
  };
}

function mergeRows(rows) {
  const ordered = [...rows].sort((left, right) => {
    const timeDifference = Date.parse(left.evidence_timestamp) - Date.parse(right.evidence_timestamp);
    return timeDifference || left._source_index - right._source_index;
  });
  const merged = new Map();
  for (const row of ordered) {
    const existing = merged.get(row.monday_item_id);
    const attribution = mergeAttribution(existing ?? {}, row);
    merged.set(row.monday_item_id, {
      ...attribution,
      evidence_timestamp: row.evidence_timestamp,
      confidence: row.confidence,
    });
  }
  return [...merged.values()].sort((left, right) => left.monday_item_id.localeCompare(
    right.monday_item_id,
    'en',
    { numeric: true },
  ));
}

function countBy(records, field) {
  return Object.fromEntries([...records.reduce((counts, record) => {
    if (!hasValue(record[field])) return counts;
    const key = String(record[field]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sum(records, field) {
  return Number(records.reduce((total, record) => total + (Number(record[field]) || 0), 0).toFixed(2));
}

function summarize(records) {
  const sourceKnown = records.filter((record) => SOURCE_FIELDS.some((field) => hasValue(record[field]))).length;
  return {
    recordCount: records.length,
    sourceKnownCount: sourceKnown,
    missingSourceCount: records.length - sourceKnown,
    sourceCoveragePercent: records.length === 0 ? 0 : Number((sourceKnown / records.length * 100).toFixed(2)),
    qualificationKnownCount: records.filter((record) => hasValue(record.qualification)).length,
    proposalCount: records.filter((record) => record.proposal === true).length,
    wonCount: records.filter((record) => record.won === true).length,
    gclidCount: records.filter((record) => hasValue(record.gclid)).length,
    fbclidCount: records.filter((record) => hasValue(record.fbclid)).length,
    potentialValueTotal: sum(records, 'potential_value'),
    revenueTotal: sum(records, 'revenue'),
    byRevenueEngine: countBy(records, 'revenue_engine'),
    byConfidence: countBy(records, 'confidence'),
  };
}

export function validateAttributionSnapshot(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Attribution snapshot must be an object');
  }
  const allowedTopLevel = new Set(['schema_version', 'generated_at', 'source', 'rows']);
  const unknown = Object.keys(snapshot).filter((key) => !allowedTopLevel.has(key));
  if (unknown.length > 0) throw new Error(`Attribution snapshot has unknown fields: ${unknown.join(', ')}`);
  if (snapshot.schema_version !== 1) throw new Error('Attribution snapshot schema_version must be 1');
  if (snapshot.source !== 'approved_attribution_export') {
    throw new Error('Attribution snapshot source must be approved_attribution_export');
  }
  if (!Array.isArray(snapshot.rows)) throw new Error('Attribution snapshot rows must be an array');
  const generatedAt = timestamp(snapshot.generated_at, 'generated_at');
  const now = new Date(options.now ?? Date.now());
  if (Number.isNaN(now.getTime())) throw new Error('Invalid validation timestamp');
  const maxAgeHours = finiteNonNegative(options.maxAgeHours ?? 168, 'maxAgeHours');
  if (maxAgeHours === 0) throw new Error('maxAgeHours must be greater than zero');
  const ageHours = (now.getTime() - generatedAt.getTime()) / 3_600_000;
  if (ageHours < -(5 / 60)) throw new Error('Attribution snapshot timestamp is in the future');
  if (ageHours > maxAgeHours) throw new Error('Attribution snapshot is stale');

  const normalizedRows = snapshot.rows.map(normalizeRow);
  for (const row of normalizedRows) {
    if (Date.parse(row.evidence_timestamp) > generatedAt.getTime() + 300_000) {
      throw new Error(`Attribution evidence for monday_item_id ${row.monday_item_id} is newer than the snapshot`);
    }
  }
  const records = mergeRows(normalizedRows);
  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    source: snapshot.source,
    records,
    summary: summarize(records),
  };
}

export async function collectAttributionReadOnly({ configPath = DEFAULT_CONFIG, now } = {}) {
  const resolvedConfig = resolve(configPath);
  const config = JSON.parse(await readFile(resolvedConfig, 'utf8'));
  const connection = config.connections?.attribution;
  if (connection?.connected !== true || connection?.sourceVerified !== true) {
    return {
      mode: 'READ_ONLY',
      connection: { status: 'CONNECTION_MISSING' },
      safety: { sourceWrites: 0, mondayWrites: 0, externalSends: 0 },
    };
  }
  if (connection.readOnly !== true) throw new Error('Attribution connection must be readOnly');
  if (connection.sourceType !== 'LOCAL_JSON_EXPORT') throw new Error('Unsupported attribution sourceType');
  if (typeof connection.sourceFile !== 'string' || !isAbsolute(connection.sourceFile)) {
    throw new Error('Attribution sourceFile must be an absolute path');
  }
  const runtimeDataRoot = resolve(config.runtimeRoot, 'data');
  const sourceFile = resolve(connection.sourceFile);
  if (!isInside(runtimeDataRoot, sourceFile)) {
    throw new Error('Attribution sourceFile must stay inside runtime data directory');
  }
  if (extname(sourceFile).toLowerCase() !== '.json') throw new Error('Attribution sourceFile must be JSON');
  const sourceStat = await stat(sourceFile);
  if (!sourceStat.isFile() || sourceStat.size > MAX_SOURCE_BYTES) {
    throw new Error('Attribution sourceFile is missing, invalid or too large');
  }
  const snapshot = JSON.parse(await readFile(sourceFile, 'utf8'));
  const validated = validateAttributionSnapshot(snapshot, {
    now,
    maxAgeHours: connection.maxAgeHours,
  });
  return {
    mode: 'READ_ONLY',
    connection: {
      status: 'LOCAL_SNAPSHOT_READ_ONLY',
      sourceType: connection.sourceType,
      sourceFile,
      sourceVerified: true,
    },
    ...validated,
    safety: {
      sourceWrites: 0,
      mondayWrites: 0,
      externalSends: 0,
      rawPiiAccepted: false,
    },
  };
}

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--config' || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    configPath = resolve(argv[index + 1]);
    index += 1;
  }
  return { configPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectAttributionReadOnly(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
