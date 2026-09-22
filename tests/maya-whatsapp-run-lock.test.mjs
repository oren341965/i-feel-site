import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { hold, request } from '../.claude/skills/maya-whatsapp/scripts/run-lock.mjs';
const pipe = process.platform === 'win32' ? '\\\\.\\pipe\\ifeel-maya-lock-test-' + process.pid : path.join(os.tmpdir(), 'ifeel-maya-lock-test-' + process.pid + '.sock');
test('exclusive ownership, wrong-owner rejection, expiry fail-closed, release and recovery', async () => {
  const a = hold('test-owner-a', {pipe, ttlMs:60000, output:()=>{}});
  await a.ready;
  try {
    const b = hold('test-owner-b', {pipe, output:()=>{}});
    await assert.rejects(b.ready, {code:'EADDRINUSE'});
    assert.equal((await request('check','test-owner-a',pipe)).status,'LOCK_VALID');
    assert.equal((await request('release','test-owner-b',pipe)).status,'NOT_OWNER');
    assert.equal((await request('check','test-owner-a',pipe)).status,'LOCK_VALID');
    assert.equal((await request('release','test-owner-a',pipe)).status,'RELEASED');
  } finally { a.close(); }
  const expired = hold('test-owner-c', {pipe, ttlMs:1, output:()=>{}});
  await expired.ready;
  try {
    assert.equal((await request('check','test-owner-c',pipe)).status,'LOCK_EXPIRED');
    const d = hold('test-owner-d', {pipe, output:()=>{}});
    await assert.rejects(d.ready, {code:'EADDRINUSE'});
    assert.equal((await request('release','test-owner-c',pipe)).status,'RELEASED');
  } finally { expired.close(); }
  await assert.rejects(request('check','test-owner-c',pipe));
});
