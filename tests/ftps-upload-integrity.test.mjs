import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { uploadFileVerified } from '../scripts/deploy/upload-file-verified.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'ifeel-upload-integrity-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'index.html');
  const bytes = Buffer.from('<html><body><h1>בקרת מבנה</h1></body></html>');
  await writeFile(path, bytes);
  return { path, size: bytes.length };
}

test('checks remote byte size after upload, including multibyte content', async t => {
  const { path, size } = await fixture(t);
  const calls = [];
  const client = {
    async uploadFrom(local, remote) { calls.push(['upload', local, remote]); },
    async size(remote) { calls.push(['size', remote]); return size; },
  };
  await uploadFileVerified(client, path, 'index.html');
  assert.deepEqual(calls, [['upload', path, 'index.html'], ['size', 'index.html']]);
});

test('rejects short, oversized and unverifiable remote files', async t => {
  const { path, size } = await fixture(t);
  for (const actual of [0, size - 1, size + 1, NaN, String(size)]) {
    const client = { async uploadFrom() {}, async size() { return actual; } };
    await assert.rejects(uploadFileVerified(client, path, 'index.html'), /FTPS size mismatch/);
  }
});

test('propagates SIZE command failure so a transfer cannot be declared successful', async t => {
  const { path } = await fixture(t);
  const failure = new Error('SIZE unavailable');
  const client = { async uploadFrom() {}, async size() { throw failure; } };
  await assert.rejects(uploadFileVerified(client, path, 'index.html'), e => e === failure);
});

test('propagates transfer failure before attempting SIZE', async t => {
  const { path } = await fixture(t);
  const failure = new Error('transfer reset');
  const client = { async uploadFrom() { throw failure; }, async size() { assert.fail('SIZE called after failed upload'); } };
  await assert.rejects(uploadFileVerified(client, path, 'index.html'), e => e === failure);
});

test('a later retry uploads the whole file and verifies it again', async t => {
  const { path, size } = await fixture(t);
  let uploads = 0;
  const client = { async uploadFrom() { uploads++; }, async size() { return uploads === 1 ? 2 : size; } };
  await assert.rejects(uploadFileVerified(client, path, 'index.html'), /FTPS size mismatch/);
  await uploadFileVerified(client, path, 'index.html');
  assert.equal(uploads, 2);
});
