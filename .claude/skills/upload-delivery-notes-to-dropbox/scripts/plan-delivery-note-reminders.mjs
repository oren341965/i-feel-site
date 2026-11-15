import { readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../../../../');
const PRIVATE_ROOT = resolve(ROOT, '.ai-manager-data/operations');
const TERMINAL = new Set(['resolved', 'filed', 'void', 'cancelled', 'not-a-delivery-note']);
const ISSUES = new Set(['missing-signature', 'missing-source', 'filing']);
const MAX_RECORDS = 10_000;
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

function records(value) {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) throw new Error('Invalid reminder records');
  return value;
}

function identity(record) {
  const number = String(record.documentNumber ?? '');
  const series = String(record.series ?? '');
  if (!/^\d{1,20}$/.test(number) || !series || series === 'unknown') return null;
  return `${series}:${number}`;
}

function sameDocument(left, right) {
  return identity(left) && identity(left) === identity(right);
}

/** Pure preflight: does not send messages or change operational state. */
export function planDeliveryNoteReminders(input) {
  const now = Date.parse(input.checkedAt);
  if (!Number.isFinite(now) || !input.runKey) throw new Error('Current run identity required');
  const candidates = records(input.candidates);
  if (input.register?.schemaVersion !== 1 || input.register?.loadedForRun !== input.runKey) {
    return { allowed: [], blocked: candidates.map((_, index) => ({ index, reason: 'REGISTER_NOT_LOADED' })) };
  }
  const register = records(input.register.records);
  const allowed = [];
  const blocked = [];
  const seen = new Set();
  candidates.forEach((candidate, index) => {
    let reason;
    const id = identity(candidate);
    const related = register.filter((record) => sameDocument(record, candidate));
    const key = `${id}:${candidate.issueType}`;
    const current = candidate.evidence;
    if (!id || !ISSUES.has(candidate.issueType)) reason = 'IDENTITY_OR_ISSUE_UNVERIFIED';
    else if (related.some((record) => TERMINAL.has(record.status)
      && (!record.issueType || record.issueType === candidate.issueType))) reason = 'TERMINALLY_RESOLVED';
    // Receipt and signature are independent of finding the final Dropbox path.
    else if (candidate.issueType === 'missing-signature' && related.some((record) => record.signedReceived === true)) reason = 'SIGNED_DOCUMENT_RECEIVED';
    else if (candidate.issueType === 'missing-source' && related.some((record) => record.sourceReceived === true || record.signedReceived === true)) reason = 'SOURCE_RECEIVED';
    else if (seen.has(key)) reason = 'DUPLICATE_CANDIDATE';
    else if (!current || current.runKey !== input.runKey || current.checkedAt !== input.checkedAt
      || current.coverageComplete !== true || !current.sourceReference) reason = 'CURRENT_EVIDENCE_REQUIRED';
    else if (!candidate.recipient || candidate.recipientVerified !== true) reason = 'RECIPIENT_UNVERIFIED';
    else if (candidate.issueType === 'missing-signature' && (current.signatureMissingConfirmed !== true
      || candidate.recipientRole !== 'assigned-technician' || current.assignmentVerified !== true)) reason = 'SIGNATURE_OR_ASSIGNMENT_UNVERIFIED';
    else if (candidate.issueType === 'missing-source' && (current.issuedConfirmed !== true
      || !current.issuanceReference || current.completeSourceAbsent !== true)) reason = 'ISSUANCE_OR_ABSENCE_UNVERIFIED';
    else if (candidate.issueType === 'filing' && (candidate.recipientRole !== 'filing-owner'
      || current.filingProblemConfirmed !== true)) reason = 'FILING_OWNER_OR_PROBLEM_UNVERIFIED';
    else {
      const noticeTimes = [candidate, ...related].map((record) => record.lastNotifiedAt).filter(Boolean);
      if (noticeTimes.some((value) => !Number.isFinite(Date.parse(value)))) reason = 'INVALID_NOTIFICATION_TIME';
      else if (noticeTimes.some((value) => now - Date.parse(value) < TWO_DAYS)) reason = 'REMINDER_NOT_DUE';
    }
    seen.add(key);
    if (reason) blocked.push({ index, reason });
    else allowed.push({ index, resolutionKey: key });
  });
  return { allowed, blocked };
}

function privatePath(value) {
  if (!value) throw new Error('Private input/output path required');
  const path = resolve(ROOT, value);
  const rel = relative(PRIVATE_ROOT, path);
  if (!rel || rel.startsWith('..') || resolve(PRIVATE_ROOT, rel) !== path) throw new Error('Path must be inside .ai-manager-data/operations');
  return path;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!['--input', '--output'].includes(argv[index]) || !argv[index + 1] || options[argv[index]]) throw new Error('Expected --input and optional --output');
    options[argv[index]] = argv[index + 1];
  }
  const path = privatePath(options['--input']);
  if ((await stat(path)).size > 10 * 1024 * 1024) throw new Error('Input too large');
  const result = planDeliveryNoteReminders(JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')));
  if (options['--output']) await writeFile(privatePath(options['--output']), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  else process.stdout.write(`${JSON.stringify({ allowed: result.allowed.length, blocked: result.blocked.length })}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch(() => { process.stderr.write('Reminder preflight failed; do not send.\n'); process.exitCode = 1; });
}
