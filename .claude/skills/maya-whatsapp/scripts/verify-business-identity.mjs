import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function normalizeBusinessName(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('he');
}

export function normalizeEmail(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

export function normalizeWebsiteHost(value) {
  const candidate = String(value ?? '').normalize('NFKC').trim();
  if (!candidate) return '';
  try {
    return new URL(candidate.includes('://') ? candidate : `https://${candidate}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeE164(value) {
  const candidate = String(value ?? '').replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(candidate)) return candidate;
  if (/^0\d{8,14}$/.test(candidate)) return `+972${candidate.slice(1)}`;
  if (/^972\d{7,12}$/.test(candidate)) return `+${candidate}`;
  return '';
}

export function fingerprintE164(value) {
  const normalized = normalizeE164(value);
  if (!normalized) return '';
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function verifyBusinessIdentity({ allowlist, observed, computer, host }) {
  const observedFingerprint = observed.phoneFingerprint || fingerprintE164(observed.phone);
  const checks = {
    computer: String(computer ?? '').toUpperCase() === String(allowlist.approvedComputer ?? '').toUpperCase(),
    host: String(host ?? '') === String(allowlist.approvedHost ?? ''),
    businessName: normalizeBusinessName(observed.businessName) === normalizeBusinessName(allowlist.businessName),
    email: normalizeEmail(observed.email) === normalizeEmail(allowlist.email),
    websiteHost: normalizeWebsiteHost(observed.website) === normalizeWebsiteHost(allowlist.websiteHost),
    phoneFingerprint:
      allowlist.phoneFingerprint?.algorithm === 'sha256-e164-v1' &&
      /^[a-f0-9]{64}$/.test(observedFingerprint) &&
      observedFingerprint === allowlist.phoneFingerprint.value,
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    status: passed ? 'PASSED_VERIFIED_MAYA' : 'BLOCKED_WHATSAPP_ALLOWLIST_MISMATCH',
    checks,
    sensitiveValuesEmitted: false,
  };
}

async function readStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input);
}

async function main() {
  const allowlistPath = process.argv[2];
  if (!allowlistPath) throw new Error('Usage: verify-business-identity.mjs <allowlist.json>');
  const [allowlist, request] = await Promise.all([
    readFile(allowlistPath, 'utf8').then(JSON.parse),
    readStdin(),
  ]);
  const result = verifyBusinessIdentity({ allowlist, ...request });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'PASSED_VERIFIED_MAYA') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
