import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SOURCES = ['requirements', 'orders', 'receipts', 'stockMovements', 'installation'];
const QUANTITY_FIELDS = ['requiredQty', 'orderedQty', 'receivedQty', 'issuedQty', 'installedQty', 'returnedQty'];
const CLOSING_FIELDS = [
  'inventoryCounted', 'technicianSummaryVerified', 'closingFormPresent',
  'closingApproval', 'closingOwnerPresent', 'closingDatePresent',
];

function parseArgs(argv) {
  const options = { includeProjectDetails: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') options.input = argv[++i];
    else if (argv[i] === '--output') options.output = argv[++i];
    else if (argv[i] === '--include-project-details') options.includeProjectDetails = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.input) throw new Error('--input is required');
  return options;
}

function privatePath(path, field) {
  const root = resolve('.ai-manager-data', 'operations');
  const target = resolve(path);
  const rel = relative(root, target);
  if (rel.startsWith('..') || rel === '' || resolve(dirname(target)) === resolve('.')) {
    throw new Error(`${field} must be inside .ai-manager-data/operations/`);
  }
  return target;
}

function timestamp(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${field} must be a valid timestamp`);
  return value;
}

function quantity(value, field) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer or null`);
  return value;
}

function addCount(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function reconcileProjectEquipment(envelope) {
  if (envelope?.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  timestamp(envelope.capturedAt, 'capturedAt');
  if (!Array.isArray(envelope.projects)) throw new Error('projects must be an array');
  const coverage = {};
  const missingSources = [];
  for (const source of REQUIRED_SOURCES) {
    const entry = envelope.sourceCoverage?.[source];
    if (!entry || !['live', 'stale', 'blocked', 'missing'].includes(entry.status)) {
      throw new Error(`sourceCoverage.${source}.status is required`);
    }
    if (entry.status === 'live') timestamp(entry.observedAt, `sourceCoverage.${source}.observedAt`);
    coverage[source] = { status: entry.status, observedAt: entry.observedAt ?? null };
    if (entry.status !== 'live') missingSources.push(source);
  }

  const states = {};
  const totals = { requiredQty: 0, orderedQty: 0, receivedQty: 0, issuedQty: 0, installedQty: 0, returnedQty: 0,
    toOrderQty: 0, toReceiveQty: 0, readyToIssueQty: 0, inFieldQty: 0, remainingToInstallQty: 0 };
  const projects = envelope.projects.map((project, projectIndex) => {
    if (typeof project.projectRef !== 'string' || !project.projectRef.trim()) throw new Error(`projects[${projectIndex}].projectRef is required`);
    if (!Array.isArray(project.equipment)) throw new Error(`projects[${projectIndex}].equipment must be an array`);
    const conflicts = [];
    const gaps = [];
    const lines = project.equipment.map((line, lineIndex) => {
      if (typeof line.lineRef !== 'string' || !line.lineRef.trim()) throw new Error(`projects[${projectIndex}].equipment[${lineIndex}].lineRef is required`);
      const values = Object.fromEntries(QUANTITY_FIELDS.map((field) => [field, quantity(line[field], `${project.projectRef}.${line.lineRef}.${field}`)]));
      const unknown = QUANTITY_FIELDS.filter((field) => values[field] === null);
      if (unknown.length) gaps.push(`${line.lineRef}:UNKNOWN_${unknown.join('_').toUpperCase()}`);
      const known = unknown.length === 0;
      const balance = known ? {
        toOrderQty: Math.max(values.requiredQty - values.orderedQty, 0),
        toReceiveQty: Math.max(values.orderedQty - values.receivedQty, 0),
        readyToIssueQty: Math.max(values.receivedQty - values.issuedQty, 0),
        inFieldQty: Math.max(values.issuedQty - values.installedQty - values.returnedQty, 0),
        remainingToInstallQty: Math.max(values.requiredQty - values.installedQty, 0),
      } : null;
      if (known) {
        if (values.orderedQty > values.requiredQty) conflicts.push(`${line.lineRef}:ORDERED_EXCEEDS_REQUIRED`);
        if (values.receivedQty > values.orderedQty) conflicts.push(`${line.lineRef}:RECEIVED_EXCEEDS_ORDERED`);
        if (values.issuedQty > values.receivedQty) conflicts.push(`${line.lineRef}:ISSUED_EXCEEDS_RECEIVED`);
        if (values.installedQty + values.returnedQty > values.issuedQty) conflicts.push(`${line.lineRef}:FIELD_DISPOSITION_EXCEEDS_ISSUED`);
        for (const field of QUANTITY_FIELDS) totals[field] += values[field];
        for (const [field, value] of Object.entries(balance)) totals[field] += value;
      }
      return { lineRef: line.lineRef, ...values, balance };
    });

    const missingClosing = CLOSING_FIELDS.filter((field) => project.closing?.[field] !== true);
    if (!project.equipment.length) gaps.push('NO_EQUIPMENT_LINES');
    let equipmentState;
    if (conflicts.length) equipmentState = 'DATA_CONFLICT';
    else if (missingSources.length || gaps.length) equipmentState = 'SOURCE_GAP';
    else if (lines.some((line) => line.balance.toOrderQty > 0)) equipmentState = 'EQUIPMENT_REQUIRED';
    else if (lines.some((line) => line.balance.toReceiveQty > 0)) equipmentState = 'WAITING_SUPPLIER';
    else if (lines.some((line) => line.balance.readyToIssueQty > 0)) equipmentState = 'READY_TO_ISSUE';
    else if (lines.some((line) => line.balance.inFieldQty > 0 || line.balance.remainingToInstallQty > 0)) equipmentState = 'FIELD_COMPLETION_OPEN';
    else equipmentState = 'RECONCILED';
    const completionState = missingClosing.length ? 'PROJECT_COMPLETION_GAP' : 'COMPLETE';
    const state = equipmentState === 'RECONCILED' ? completionState : equipmentState;
    addCount(states, state);
    return { projectRef: project.projectRef, projectName: project.projectName ?? null, state, equipmentState, completionState, conflicts, gaps, missingClosing, lines };
  });

  return {
    schemaVersion: 1,
    capturedAt: envelope.capturedAt,
    sourceWindow: envelope.sourceWindow ?? null,
    sourceCoverage: coverage,
    missingSources,
    summary: { projects: projects.length, states, ...totals },
    projects,
  };
}

function publicResult(result, includeProjectDetails) {
  if (includeProjectDetails) return result;
  return {
    schemaVersion: result.schemaVersion,
    capturedAt: result.capturedAt,
    sourceWindow: result.sourceWindow,
    sourceCoverage: result.sourceCoverage,
    missingSources: result.missingSources,
    summary: result.summary,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const input = privatePath(options.input, '--input');
    const result = reconcileProjectEquipment(JSON.parse(await readFile(input, 'utf8')));
    const output = `${JSON.stringify(publicResult(result, options.includeProjectDetails), null, 2)}\n`;
    if (options.output) {
      const target = privatePath(options.output, '--output');
      await writeFile(target, output, { encoding: 'utf8', flag: 'wx' });
    } else process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
