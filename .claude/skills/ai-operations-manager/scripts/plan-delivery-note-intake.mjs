import { readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLAN_VERSION = 1;

const REPO_ROOT = resolve(import.meta.dirname, '../../../../');
const PRIVATE_ROOT = resolve(REPO_ROOT, '.ai-manager-data/operations');
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const MAX_FOLDERS = 100_000;
const SUPPORTED_SOURCES = new Set(['email', 'whatsapp']);
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

function requireArray(value, name, max) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > max) throw new RangeError(`${name} exceeds ${max} items`);
  return value;
}

function cleanText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeCustomerNumber(value) {
  const text = cleanText(value);
  if (!text || !/^\d(?:[\d\s-]*\d)?$/.test(text)) return null;
  const normalized = text.replace(/[\s-]/g, '');
  return normalized.length >= 3 && normalized.length <= 20 ? normalized : null;
}

function normalizeHash(value) {
  const text = cleanText(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function hasExactDigitToken(path, number) {
  const text = String(path);
  let cursor = text.indexOf(number);
  while (cursor >= 0) {
    const before = cursor === 0 ? '' : text[cursor - 1];
    const after = text[cursor + number.length] ?? '';
    if (!/\d/.test(before) && !/\d/.test(after)) return true;
    cursor = text.indexOf(number, cursor + 1);
  }
  return false;
}

function isDeliveryNotesFolder(path) {
  const parts = String(path).replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  return parts.at(-1)?.normalize('NFC') === 'תעודות משלוח';
}

function folderPath(folder) {
  return cleanText(folder?.pathDisplay) || cleanText(folder?.path);
}

function matchingFolders(folders, customerNumber) {
  const unique = new Map();
  for (const folder of folders) {
    const path = folderPath(folder);
    const type = cleanText(folder?.objectType).toLowerCase();
    if (!path || (type && type !== 'folder')) continue;
    if (!isDeliveryNotesFolder(path) || !hasExactDigitToken(path, customerNumber)) continue;
    const key = path.normalize('NFC').toLocaleLowerCase('he');
    if (!unique.has(key)) unique.set(key, path);
  }
  return [...unique.values()];
}

function candidateNumbers(record) {
  const raw = [];
  if (record?.customerNumber !== undefined) raw.push(record.customerNumber);
  if (Array.isArray(record?.customerNumberCandidates)) {
    for (const candidate of record.customerNumberCandidates) {
      raw.push(candidate && typeof candidate === 'object' ? candidate.value : candidate);
    }
  }
  return [...new Set(raw.map(normalizeCustomerNumber).filter(Boolean))];
}

function safeFileName(value) {
  const raw = cleanText(value).replace(/\\/g, '/').split('/').at(-1) ?? '';
  const cleaned = raw
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!cleaned) return null;
  const extension = cleaned.includes('.') ? `.${cleaned.split('.').at(-1).toLowerCase()}` : '';
  if (!SUPPORTED_EXTENSIONS.has(extension)) return { name: cleaned.slice(0, 180), supported: false };
  const stemLength = Math.max(1, 180 - extension.length);
  const stem = cleaned.slice(0, -extension.length).slice(0, stemLength);
  return { name: `${stem}${extension}`, supported: true };
}

function documentKey(customerNumber, documentNumber) {
  const number = cleanText(documentNumber).toLocaleLowerCase('en-US');
  return customerNumber && number ? `${customerNumber}\u0000${number}` : null;
}

function addReason(reasonCounts, reason) {
  reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
}

function aggregateSummary(records, generatedAt) {
  const counts = { total: records.length, ready: 0, duplicate: 0, needsReview: 0 };
  const reasonCounts = {};
  for (const record of records) {
    if (record.status === 'ready') counts.ready += 1;
    if (record.status === 'duplicate') counts.duplicate += 1;
    if (record.status === 'needs-review') counts.needsReview += 1;
    for (const reason of record.reasons) addReason(reasonCounts, reason);
  }
  return { planVersion: PLAN_VERSION, generatedAt, counts, reasonCounts };
}

export function planDeliveryNoteIntake(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new TypeError('envelope must be an object');
  }
  const records = requireArray(envelope.records, 'records', MAX_RECORDS);
  const folders = requireArray(envelope.customerFolders, 'customerFolders', MAX_FOLDERS);
  const existing = requireArray(envelope.existingDocuments ?? [], 'existingDocuments', MAX_FOLDERS);
  const generatedAt = cleanText(envelope.generatedAt);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new TypeError('generatedAt must be an ISO date-time');

  const priorSources = new Set(existing.map((entry) => cleanText(entry?.sourceId)).filter(Boolean));
  const priorHashes = new Set(existing.map((entry) => normalizeHash(entry?.contentHash)).filter(Boolean));
  const priorDocuments = new Set(existing.map((entry) => {
    return documentKey(normalizeCustomerNumber(entry?.customerNumber), entry?.documentNumber);
  }).filter(Boolean));
  const seenSources = new Set();
  const seenHashes = new Set();
  const seenDocuments = new Set();

  const plannedRecords = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { index, source: null, sourceId: null, status: 'needs-review', reasons: ['INVALID_RECORD'] };
    }
    const source = cleanText(record.source).toLowerCase();
    const sourceId = cleanText(record.sourceId);
    const hash = normalizeHash(record.contentHash);
    const numbers = candidateNumbers(record);
    const customerNumber = numbers.length === 1 ? numbers[0] : null;
    const docKey = documentKey(customerNumber, record.documentNumber);
    const reasons = [];

    if (!SUPPORTED_SOURCES.has(source)) reasons.push('UNSUPPORTED_SOURCE');
    if (!sourceId) reasons.push('MISSING_SOURCE_ID');
    if (record.contentHash && !hash) reasons.push('INVALID_CONTENT_HASH');
    if (numbers.length === 0) reasons.push('MISSING_CUSTOMER_NUMBER');
    if (numbers.length > 1) reasons.push('CONFLICTING_CUSTOMER_NUMBERS');

    const duplicateReasons = [];
    if (sourceId && (priorSources.has(sourceId) || seenSources.has(sourceId))) duplicateReasons.push('DUPLICATE_SOURCE');
    if (hash && (priorHashes.has(hash) || seenHashes.has(hash))) duplicateReasons.push('DUPLICATE_HASH');
    if (docKey && (priorDocuments.has(docKey) || seenDocuments.has(docKey))) duplicateReasons.push('DUPLICATE_DOCUMENT');

    if (sourceId) seenSources.add(sourceId);
    if (hash) seenHashes.add(hash);
    if (docKey) seenDocuments.add(docKey);

    const file = safeFileName(record.originalFileName);
    if (!file) reasons.push('MISSING_ORIGINAL_FILENAME');
    else if (!file.supported) reasons.push('UNSUPPORTED_ATTACHMENT');

    const matches = customerNumber ? matchingFolders(folders, customerNumber) : [];
    if (customerNumber && matches.length === 0) reasons.push('CUSTOMER_FOLDER_NOT_FOUND');
    if (customerNumber && matches.length > 1) reasons.push('AMBIGUOUS_CUSTOMER_FOLDER');

    if (duplicateReasons.length > 0) {
      return {
        index, source, sourceId, status: 'duplicate', reasons: duplicateReasons,
        customerNumber, documentNumber: cleanText(record.documentNumber) || null,
      };
    }
    if (reasons.length > 0) {
      return {
        index, source, sourceId, status: 'needs-review', reasons,
        customerNumber, documentNumber: cleanText(record.documentNumber) || null,
        candidateDestinations: matches,
      };
    }

    const destinationFolder = matches[0];
    return {
      index, source, sourceId, status: 'ready', reasons: [], customerNumber,
      documentNumber: cleanText(record.documentNumber) || null,
      originalFileName: file.name, destinationFolder,
      destinationPath: `${destinationFolder.replace(/\/+$/, '')}/${file.name}`,
    };
  });

  return {
    ...aggregateSummary(plannedRecords, generatedAt),
    records: plannedRecords,
  };
}

function assertPrivatePath(value, label) {
  const path = resolve(REPO_ROOT, cleanText(value));
  const rel = relative(PRIVATE_ROOT, path);
  if (!rel || rel.startsWith('..') || resolve(PRIVATE_ROOT, rel) !== path) {
    throw new Error(`${label} must be inside .ai-manager-data/operations`);
  }
  return path;
}

function parseArgs(argv) {
  const options = { input: null, output: null, includeOperationalDetails: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input' || arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg === '--include-operational-details') {
      options.includeOperationalDetails = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.input) throw new Error('--input is required');
  if (options.output && !options.includeOperationalDetails) {
    throw new Error('--output requires --include-operational-details');
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const inputPath = assertPrivatePath(options.input, 'input');
  const inputStat = await stat(inputPath);
  if (inputStat.size > MAX_INPUT_BYTES) throw new RangeError(`input exceeds ${MAX_INPUT_BYTES} bytes`);
  const envelope = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = planDeliveryNoteIntake(envelope);
  const output = options.includeOperationalDetails
    ? result
    : { planVersion: result.planVersion, generatedAt: result.generatedAt, counts: result.counts, reasonCounts: result.reasonCounts };

  if (options.output) {
    const outputPath = assertPrivatePath(options.output, 'output');
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } else {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
