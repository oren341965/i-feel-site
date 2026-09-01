import { readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLAN_VERSION = 4;
export const OWNER_SKILL = 'ai-operations-manager';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../');
const PRIVATE_ROOT = resolve(REPO_ROOT, '.ai-manager-data/operations');
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const MAX_FOLDERS = 100_000;
const MAX_PARTS = 100;
const SUPPORTED_SOURCES = new Set(['email', 'whatsapp']);
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const DEFAULT_WHATSAPP_GROUP = 'סיכומי התקנות ות משלוח';
const MISSING_FOLDER_MESSAGE = 'שימו לב- לקוח ללא תיק בדרופבוקס !!!!';
const UNCLEAR_DOCUMENT_MESSAGE = 'נא לשלוח שנית- התעודה לא היתה ברורה';
const CANONICAL_DELIVERY_NOTE_FOLDER = 'תעודת משלוח';
const DELIVERY_NOTE_FOLDER_NAMES = new Set([CANONICAL_DELIVERY_NOTE_FOLDER, 'תעודות משלוח']);

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

function normalizePartNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= MAX_PARTS ? number : null;
}

function wasSupplied(value) {
  return value !== null && value !== undefined && value !== '';
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
  const finalComponent = parts.at(-1)?.normalize('NFC');
  return finalComponent ? DELIVERY_NOTE_FOLDER_NAMES.has(finalComponent) : false;
}

function folderPath(folder) {
  return cleanText(folder?.pathDisplay) || cleanText(folder?.path);
}

function explicitFolderProjectKey(folder) {
  return normalizeCustomerNumber(folder?.projectKey ?? folder?.customerNumber);
}

function folderMatchesProjectKey(folder, projectKey) {
  const path = folderPath(folder);
  if (!path) return false;
  const explicit = explicitFolderProjectKey(folder);
  return explicit ? explicit === projectKey : hasExactDigitToken(path, projectKey);
}

function matchingFolders(folders, projectKey) {
  const unique = new Map();
  for (const folder of folders) {
    const path = folderPath(folder);
    const type = cleanText(folder?.objectType).toLowerCase();
    if (!path || (type && type !== 'folder')) continue;
    if (!isDeliveryNotesFolder(path) || !folderMatchesProjectKey(folder, projectKey)) continue;
    const key = path.normalize('NFC').toLocaleLowerCase('he');
    if (!unique.has(key)) unique.set(key, path);
  }
  return [...unique.values()];
}

function matchingProjectFolders(folders, projectKey) {
  const unique = new Map();
  for (const folder of folders) {
    const path = folderPath(folder);
    const type = cleanText(folder?.objectType).toLowerCase();
    if (!path || (type && type !== 'folder')) continue;
    if (isDeliveryNotesFolder(path) || !folderMatchesProjectKey(folder, projectKey)) continue;
    const key = path.normalize('NFC').toLocaleLowerCase('he');
    if (!unique.has(key)) unique.set(key, path);
  }
  return [...unique.values()];
}

function projectKeyNumbers(record) {
  const raw = [];
  if (record?.projectKey !== undefined) raw.push(record.projectKey);
  if (Array.isArray(record?.projectKeyCandidates)) {
    for (const candidate of record.projectKeyCandidates) {
      raw.push(candidate && typeof candidate === 'object' ? candidate.value : candidate);
    }
  }
  return [...new Set(raw.map(normalizeCustomerNumber).filter(Boolean))];
}

function normalizeEmail(value) {
  const text = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 320 ? text : null;
}

function normalizeDocumentNumber(value) {
  const text = cleanText(value).replace(/\s+/g, '');
  return /^[\p{L}\d][\p{L}\d./-]{1,49}$/u.test(text) ? text : null;
}

function normalizeDocumentType(value) {
  const text = cleanText(value).normalize('NFC').toLocaleLowerCase('he').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return text === 'תעודת משלוח' || text === 'delivery note' ? 'delivery-note' : null;
}

function normalizeDocumentDate(value) {
  const text = cleanText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? text
    : null;
}

function safeLabel(value, maxLength = 100) {
  const text = cleanText(value)
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeFileName(value) {
  const raw = cleanText(value).replace(/\\/g, '/').split('/').at(-1) ?? '';
  const cleaned = raw
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!cleaned) return null;
  const extension = cleaned.includes('.') ? `.${cleaned.split('.').at(-1).toLowerCase()}` : '';
  if (!SUPPORTED_EXTENSIONS.has(extension)) return { name: cleaned.slice(0, 180), extension, supported: false };
  const stemLength = Math.max(1, 180 - extension.length);
  const stem = cleaned.slice(0, -extension.length).slice(0, stemLength);
  if (!stem) return null;
  return { name: `${stem}${extension}`, extension, supported: true };
}

function descriptiveFileName({ customerName, documentNumber, description, sourceFile, partNumber, partCount }) {
  if (!sourceFile?.supported || !customerName || !documentNumber || !description) return null;
  const suffix = sourceFile.extension;
  const partSuffix = partNumber
    ? ` - עמוד ${partNumber}${partCount ? ` מתוך ${partCount}` : ''}`
    : '';
  const prefix = `${customerName} - תעודת משלוח ${documentNumber} - `;
  const descriptionLimit = Math.max(1, 180 - prefix.length - partSuffix.length - suffix.length);
  return `${prefix}${description.slice(0, descriptionLimit)}${partSuffix}${suffix}`;
}

function documentBaseKey(projectKey, documentNumber) {
  const number = cleanText(documentNumber).toLocaleLowerCase('en-US');
  return projectKey && number ? `${projectKey}\u0000${number}` : null;
}

function documentPartKey(projectKey, documentNumber, partNumber) {
  const base = documentBaseKey(projectKey, documentNumber);
  return base ? `${base}\u0000${partNumber ?? 'single'}` : null;
}

function addReason(reasonCounts, reason) {
  reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
}

function addIssue(issueMap, index, issue) {
  const issues = issueMap.get(index) ?? [];
  if (!issues.includes(issue)) issues.push(issue);
  issueMap.set(index, issues);
}

function buildMultipartIssues(records) {
  const groups = new Map();
  const issueMap = new Map();

  records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    const projectKeys = projectKeyNumbers(record);
    const documentNumber = normalizeDocumentNumber(record.documentNumber);
    if (projectKeys.length !== 1 || !documentNumber) return;
    const baseKey = documentBaseKey(projectKeys[0], documentNumber);
    if (!baseKey) return;
    const group = groups.get(baseKey) ?? { indexes: [], expectedCounts: new Set(), parts: new Set() };
    group.indexes.push(index);
    const partNumber = normalizePartNumber(record.partNumber);
    const partCount = normalizePartNumber(record.partCount);
    if (partCount) group.expectedCounts.add(partCount);
    if (partNumber) group.parts.add(partNumber);
    groups.set(baseKey, group);
  });

  for (const group of groups.values()) {
    if (group.expectedCounts.size > 1) {
      for (const index of group.indexes) addIssue(issueMap, index, 'CONFLICTING_PART_COUNTS');
      continue;
    }
    const expectedCount = [...group.expectedCounts][0] ?? null;
    if (!expectedCount || expectedCount <= 1) continue;

    for (const index of group.indexes) {
      const partNumber = normalizePartNumber(records[index]?.partNumber);
      if (!partNumber) addIssue(issueMap, index, 'MISSING_PART_NUMBER');
      else if (partNumber > expectedCount) addIssue(issueMap, index, 'INVALID_PART_RANGE');
    }

    const missing = [];
    for (let part = 1; part <= expectedCount; part += 1) {
      if (!group.parts.has(part)) missing.push(part);
    }
    if (missing.length > 0) {
      for (const index of group.indexes) addIssue(issueMap, index, 'MISSING_DOCUMENT_PARTS');
    }
  }

  return issueMap;
}

function uniqueEmails(values) {
  return [...new Set(values.map(normalizeEmail).filter(Boolean))];
}

function buildNotificationDraft({ issues, oraEmail, senderEmail }) {
  const messages = [];
  if (issues.includes('MISSING_PROJECT_KEY') || issues.includes('CUSTOMER_FOLDER_NOT_FOUND')) {
    messages.push(MISSING_FOLDER_MESSAGE);
  }
  if (issues.includes('UNCLEAR_DOCUMENT_TYPE') || issues.includes('UNCLEAR_DOCUMENT_NUMBER') || issues.includes('MISSING_CUSTOMER_NAME')) {
    messages.push(UNCLEAR_DOCUMENT_MESSAGE);
  }
  if (messages.length === 0) return null;
  const recipients = uniqueEmails([oraEmail, senderEmail]);
  const subject = messages.length > 1
    ? 'טיפול נדרש: תעודת משלוח'
    : messages[0] === MISSING_FOLDER_MESSAGE
      ? 'טיפול נדרש: לקוח ללא תיק בדרופבוקס'
      : 'טיפול נדרש: תעודה לא ברורה';
  return { recipients, subject, body: messages.join('\n\n'), attachOriginal: true };
}

function aggregateSummary(records, generatedAt) {
  const counts = {
    total: records.length,
    ready: 0,
    duplicate: 0,
    notificationRequired: 0,
    needsReview: 0,
    folderCreationRequired: 0,
    incompleteMultipart: 0,
  };
  const reasonCounts = {};
  for (const record of records) {
    if (record.status === 'ready') counts.ready += 1;
    if (record.status === 'duplicate') counts.duplicate += 1;
    if (record.status === 'notification-required') counts.notificationRequired += 1;
    if (record.status === 'needs-review') counts.needsReview += 1;
    if (record.folderCreation?.required) counts.folderCreationRequired += 1;
    if (record.reasons.includes('MISSING_DOCUMENT_PARTS')) counts.incompleteMultipart += 1;
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
  const projectFolders = requireArray(envelope.projectFolders ?? [], 'projectFolders', MAX_FOLDERS);
  const existing = requireArray(envelope.existingDocuments ?? [], 'existingDocuments', MAX_FOLDERS);
  const generatedAt = cleanText(envelope.generatedAt);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new TypeError('generatedAt must be an ISO date-time');
  const expectedWhatsAppGroup = cleanText(envelope.sourceContext?.whatsAppGroupName) || DEFAULT_WHATSAPP_GROUP;
  const oraEmail = normalizeEmail(envelope.notificationContext?.oraEmail);
  const multipartIssues = buildMultipartIssues(records);

  const priorSources = new Set(existing.map((entry) => cleanText(entry?.sourceId)).filter(Boolean));
  const priorHashes = new Set(existing.map((entry) => normalizeHash(entry?.contentHash)).filter(Boolean));
  const priorDocuments = new Set(existing.map((entry) => {
    return documentPartKey(
      normalizeCustomerNumber(entry?.projectKey ?? entry?.customerNumber),
      normalizeDocumentNumber(entry?.documentNumber),
      normalizePartNumber(entry?.partNumber),
    );
  }).filter(Boolean));
  const priorUnpartitionedDocuments = new Set(existing.filter((entry) => !normalizePartNumber(entry?.partNumber)).map((entry) => {
    return documentBaseKey(
      normalizeCustomerNumber(entry?.projectKey ?? entry?.customerNumber),
      normalizeDocumentNumber(entry?.documentNumber),
    );
  }).filter(Boolean));
  const priorPaths = new Set(existing.map((entry) => {
    return cleanText(entry?.pathDisplay) || cleanText(entry?.path);
  }).filter(Boolean).map((path) => path.normalize('NFC').toLocaleLowerCase('he')));
  const seenSources = new Set();
  const seenHashes = new Set();
  const seenDocuments = new Set();
  const seenPaths = new Set();

  const plannedRecords = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { index, source: null, sourceId: null, status: 'needs-review', reasons: ['INVALID_RECORD'] };
    }
    const source = cleanText(record.source).toLowerCase();
    const sourceId = cleanText(record.sourceId);
    const hash = normalizeHash(record.contentHash);
    const projectKeys = projectKeyNumbers(record);
    const projectKey = projectKeys.length === 1 ? projectKeys[0] : null;
    const documentNumber = normalizeDocumentNumber(record.documentNumber);
    const documentType = normalizeDocumentType(record.documentType);
    const customerName = safeLabel(record.customerName, 100);
    const supplierName = safeLabel(record.supplierName, 100);
    const documentDate = normalizeDocumentDate(record.documentDate);
    const description = safeLabel(record.description, 120);
    const senderEmail = normalizeEmail(record.senderEmail);
    const sourceGroup = cleanText(record.sourceGroup);
    const partNumber = normalizePartNumber(record.partNumber);
    const partCount = normalizePartNumber(record.partCount);
    const baseDocKey = documentBaseKey(projectKey, documentNumber);
    const docKey = documentPartKey(projectKey, documentNumber, partNumber);
    const reasons = [...(multipartIssues.get(index) ?? [])];

    if (!SUPPORTED_SOURCES.has(source)) reasons.push('UNSUPPORTED_SOURCE');
    if (!sourceId) reasons.push('MISSING_SOURCE_ID');
    if (source === 'whatsapp' && sourceGroup !== expectedWhatsAppGroup) reasons.push('WRONG_WHATSAPP_GROUP');
    if (record.contentHash && !hash) reasons.push('INVALID_CONTENT_HASH');
    if (projectKeys.length === 0) reasons.push('MISSING_PROJECT_KEY');
    if (projectKeys.length > 1) reasons.push('CONFLICTING_PROJECT_KEYS');
    if (!customerName) reasons.push('MISSING_CUSTOMER_NAME');
    if (!documentType) reasons.push('UNCLEAR_DOCUMENT_TYPE');
    if (!documentNumber) reasons.push('UNCLEAR_DOCUMENT_NUMBER');
    if (!description) reasons.push('MISSING_DESCRIPTION');
    if (wasSupplied(record.partNumber) && !partNumber) reasons.push('INVALID_PART_NUMBER');
    if (wasSupplied(record.partCount) && !partCount) reasons.push('INVALID_PART_COUNT');
    if (partNumber && partCount && partNumber > partCount) reasons.push('INVALID_PART_RANGE');

    const duplicateReasons = [];
    if (sourceId && (priorSources.has(sourceId) || seenSources.has(sourceId))) duplicateReasons.push('DUPLICATE_SOURCE');
    if (hash && (priorHashes.has(hash) || seenHashes.has(hash))) duplicateReasons.push('DUPLICATE_HASH');
    if (docKey && (priorDocuments.has(docKey) || seenDocuments.has(docKey))) duplicateReasons.push('DUPLICATE_DOCUMENT');
    if (baseDocKey && partCount && partCount > 1 && priorUnpartitionedDocuments.has(baseDocKey)) {
      reasons.push('UNCERTAIN_EXISTING_MULTIPART_DOCUMENT');
    }

    if (sourceId) seenSources.add(sourceId);
    if (hash) seenHashes.add(hash);
    if (docKey) seenDocuments.add(docKey);

    const file = safeFileName(record.originalFileName);
    if (!file) reasons.push('MISSING_ORIGINAL_FILENAME');
    else if (!file.supported) reasons.push('UNSUPPORTED_ATTACHMENT');

    const matches = projectKey ? matchingFolders(folders, projectKey) : [];
    const projectMatches = projectKey && matches.length === 0
      ? matchingProjectFolders(projectFolders, projectKey)
      : [];

    if (projectKey && matches.length > 1) reasons.push('AMBIGUOUS_CUSTOMER_FOLDER');
    if (projectKey && matches.length === 0 && projectMatches.length === 0) reasons.push('CUSTOMER_FOLDER_NOT_FOUND');
    if (projectKey && matches.length === 0 && projectMatches.length > 1) reasons.push('AMBIGUOUS_PROJECT_FOLDER');

    const destinationFileName = descriptiveFileName({
      customerName,
      documentNumber,
      description,
      sourceFile: file,
      partNumber,
      partCount,
    });
    const existingDestinationFolder = matches.length === 1 ? matches[0] : null;
    const projectParent = matches.length === 0 && projectMatches.length === 1 ? projectMatches[0] : null;
    const plannedDestinationFolder = projectParent
      ? `${projectParent.replace(/\/+$/, '')}/${CANONICAL_DELIVERY_NOTE_FOLDER}`
      : null;
    const destinationFolder = existingDestinationFolder ?? plannedDestinationFolder;
    const folderCreation = projectParent
      ? {
          required: true,
          parentPath: projectParent,
          folderName: CANONICAL_DELIVERY_NOTE_FOLDER,
          destinationFolder: plannedDestinationFolder,
        }
      : null;
    const destinationPath = destinationFolder && destinationFileName
      ? `${destinationFolder.replace(/\/+$/, '')}/${destinationFileName}`
      : null;
    const destinationKey = destinationPath?.normalize('NFC').toLocaleLowerCase('he') ?? null;
    if (destinationKey && (priorPaths.has(destinationKey) || seenPaths.has(destinationKey))) {
      duplicateReasons.push('DUPLICATE_DESTINATION_PATH');
    }
    if (destinationKey) seenPaths.add(destinationKey);

    if (duplicateReasons.length > 0) {
      return {
        index,
        source,
        sourceId,
        status: 'duplicate',
        reasons: duplicateReasons,
        projectKey,
        documentNumber,
        partNumber,
        partCount,
      };
    }

    const notificationDraft = buildNotificationDraft({ issues: reasons, oraEmail, senderEmail });
    if (notificationDraft) {
      if (!oraEmail) reasons.push('MISSING_ORA_EMAIL');
      if (!senderEmail) reasons.push('MISSING_SENDER_EMAIL');
      const blockingReasons = reasons.filter((reason) => ![
        'MISSING_PROJECT_KEY',
        'CUSTOMER_FOLDER_NOT_FOUND',
        'MISSING_CUSTOMER_NAME',
        'UNCLEAR_DOCUMENT_TYPE',
        'UNCLEAR_DOCUMENT_NUMBER',
      ].includes(reason));
      if (blockingReasons.length === 0 && notificationDraft.recipients.length === 2) {
        return {
          index,
          source,
          sourceId,
          status: 'notification-required',
          reasons,
          projectKey,
          customerName,
          supplierName,
          documentDate,
          documentType,
          documentNumber,
          partNumber,
          partCount,
          notificationDraft,
        };
      }
    }
    if (reasons.length > 0) {
      return {
        index,
        source,
        sourceId,
        status: 'needs-review',
        reasons,
        projectKey,
        customerName,
        supplierName,
        documentDate,
        documentType,
        documentNumber,
        partNumber,
        partCount,
        candidateDestinations: matches,
        candidateProjectFolders: projectMatches,
        folderCreation,
        notificationDraft,
      };
    }

    return {
      index,
      source,
      sourceId,
      status: 'ready',
      reasons: [],
      projectKey,
      customerName,
      supplierName,
      documentDate,
      documentType,
      documentNumber,
      description,
      partNumber,
      partCount,
      originalFileName: file.name,
      destinationFileName,
      destinationFolder,
      destinationPath,
      folderAction: folderCreation ? 'create' : 'use-existing',
      folderCreation,
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
