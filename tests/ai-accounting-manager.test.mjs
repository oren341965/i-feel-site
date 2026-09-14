import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repo = resolve('.');
const managerDir = resolve(repo, '.claude/skills/ai-accounting-manager');
const expected = [
  'ai-accounting-manager',
  'invoice-forwarding-accounting',
  'daily-digest-accounting',
  'expense-file',
  'ai-finance-manager',
];

test('accounting registry contains complete unique capability contracts', async () => {
  const registry = JSON.parse(await readFile(resolve(managerDir, 'references/management-registration.json'), 'utf8'));
  assert.equal(registry.system, 'I FEEL MANAGEMENT SYSTEM');
  assert.deepEqual(registry.capabilities.map(({ slug }) => slug), expected);
  assert.equal(new Set(registry.capabilities.map(({ slug }) => slug)).size, expected.length);

  for (const capability of registry.capabilities) {
    for (const key of ['owner', 'role', 'dependencies', 'capabilities', 'triggers', 'permissions', 'dataSources', 'logging', 'orchestration']) {
      assert.ok(key in capability, `${capability.slug} missing ${key}`);
    }
    assert.deepEqual(capability.logging.statuses, ['running', 'succeeded', 'failed', 'blocked']);
    assert.equal(capability.permissions.financialAction, 'restricted');
    assert.equal(capability.permissions.secretsOrExternalPermissions, 'restricted');
  }
});

test('registered skills exist and declare their exact names', async () => {
  for (const slug of expected) {
    const skill = await readFile(resolve(repo, `.claude/skills/${slug}/SKILL.md`), 'utf8');
    assert.match(skill, new RegExp(`^---\\r?\\nname: ${slug}\\r?$`, 'm'));
    assert.match(skill, /management-system-telemetry/);
  }
});

test('orchestration is one parent with four reciprocal workers', async () => {
  const registry = JSON.parse(await readFile(resolve(managerDir, 'references/management-registration.json'), 'utf8'));
  const bySlug = new Map(registry.capabilities.map((entry) => [entry.slug, entry]));
  const children = bySlug.get('ai-accounting-manager').orchestration.children;
  assert.deepEqual(children, expected.slice(1));
  for (const child of children) assert.equal(bySlug.get(child).orchestration.parent, 'ai-accounting-manager');
});

test('sensitive mutations stay approval-gated or restricted', async () => {
  const registry = JSON.parse(await readFile(resolve(managerDir, 'references/management-registration.json'), 'utf8'));
  for (const entry of registry.capabilities) {
    assert.notEqual(entry.permissions.write, 'allowed');
    assert.notEqual(entry.permissions.send, 'allowed');
  }
});
