#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SKILL_SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;

function fail(message) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (argument === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (!argument.startsWith('--')) fail(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${argument}`);
    args[argument.slice(2)] = value;
    index += 1;
  }
  return args;
}

function usage() {
  return `Usage: audit-source-sync.mjs --repo <path> --vault <path> [--installed-skills <path>] [--dry-run]\n\nCompares canonical GitHub Skill packages with Obsidian registry entries and an optional local installation. It reads metadata only and never changes any source.`;
}

function frontmatter(text) {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n')
    .replace(/^(?:[ \t]*\n)+(?=---\n)/, '');
  if (!normalized.startsWith('---\n')) return {};
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return {};
  const result = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([a-zA-Z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (match) result[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return result;
}

async function directoryNames(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function discoverCanonicalSkills(repoPath) {
  const root = join(repoPath, '.claude', 'skills');
  const slugs = await directoryNames(root);
  const skills = [];
  for (const slug of slugs) {
    if (!SKILL_SLUG.test(slug)) continue;
    const skillPath = join(root, slug, 'SKILL.md');
    let content;
    try {
      content = await readFile(skillPath, 'utf8');
    } catch {
      continue;
    }
    const metadata = frontmatter(content);
    skills.push({
      slug,
      declaredName: metadata.name || null,
      sourcePath: `.claude/skills/${slug}/SKILL.md`,
      sourceHash: createHash('sha256').update(content).digest('hex'),
    });
  }
  return skills;
}

async function discoverVaultEntries(vaultPath) {
  const root = join(vaultPath, '02 Skills', 'Entries');
  const entries = await readdir(root, { withFileTypes: true });
  const result = new Map();
  for (const entry of entries) {
    // Dropbox Files On-Demand may expose hydrated Markdown documents as
    // symbolic links/reparse points on Windows. Reading the target remains
    // metadata-only, so accept both regular files and those placeholders.
    if ((!entry.isFile() && !entry.isSymbolicLink()) || !entry.name.toLowerCase().endsWith('.md')) continue;
    const slug = basename(entry.name, '.md');
    if (!SKILL_SLUG.test(slug)) continue;
    const content = await readFile(join(root, entry.name), 'utf8');
    const metadata = frontmatter(content);
    result.set(slug, {
      status: metadata.status || 'UNKNOWN',
      version: metadata.version || null,
      knowledgePath: `02 Skills/Entries/${entry.name}`,
    });
  }
  return result;
}

function gitRevision(repoPath) {
  const result = spawnSync('git', ['-c', `safe.directory=${repoPath.replaceAll('\\', '/')}`, '-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0) fail('Unable to resolve Git revision');
  return result.stdout.trim();
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

if (!args.repo || !args.vault) fail('--repo and --vault are required');
const repoPath = resolve(args.repo);
const vaultPath = resolve(args.vault);
const canonical = await discoverCanonicalSkills(repoPath).catch(() => fail('Canonical Skill directory is unavailable'));
const vaultEntries = await discoverVaultEntries(vaultPath).catch(() => fail('Vault Skill registry is unavailable'));
const installed = args['installed-skills']
  ? new Set(await directoryNames(resolve(args['installed-skills'])).catch(() => fail('Installed Skill directory is unavailable')))
  : null;
const revision = gitRevision(repoPath);

const capabilities = canonical.map((skill) => {
  const knowledge = vaultEntries.get(skill.slug);
  return {
    slug: skill.slug,
    sourcePath: skill.sourcePath,
    sourceHash: skill.sourceHash,
    declaredNameMatches: skill.declaredName === skill.slug,
    knowledgePath: knowledge?.knowledgePath ?? null,
    knowledgeStatus: knowledge?.status ?? 'MISSING',
    knowledgeVersion: knowledge?.version ?? null,
    knowledgeAtRevision: knowledge?.version === revision,
    installed: installed ? installed.has(skill.slug) : null,
  };
});

const canonicalSlugs = new Set(canonical.map((skill) => skill.slug));
const orphanedVaultEntries = [...vaultEntries.keys()].filter((slug) => !canonicalSlugs.has(slug)).sort();
const summary = {
  canonical: capabilities.length,
  knowledgeLinked: capabilities.filter((item) => item.knowledgePath).length,
  knowledgeAtRevision: capabilities.filter((item) => item.knowledgeAtRevision).length,
  installed: installed ? capabilities.filter((item) => item.installed).length : null,
  missingKnowledge: capabilities.filter((item) => !item.knowledgePath).map((item) => item.slug),
  staleKnowledge: capabilities.filter((item) => item.knowledgePath && !item.knowledgeAtRevision).map((item) => item.slug),
  missingInstalled: installed ? capabilities.filter((item) => !item.installed).map((item) => item.slug) : [],
  orphanedVaultEntries,
  invalidDeclaredNames: capabilities.filter((item) => !item.declaredNameMatches).map((item) => item.slug),
};

const output = {
  ok: summary.missingKnowledge.length === 0 && summary.missingInstalled.length === 0 && summary.invalidDeclaredNames.length === 0,
  dryRun: args.dryRun,
  schemaVersion: 1,
  source: { repository: 'oren341965/i-feel-site', revision },
  observedAt: new Date().toISOString(),
  summary,
  capabilities,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (!output.ok) process.exitCode = 1;
