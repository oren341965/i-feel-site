import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPECTED_CHANNEL_ID,
  assertExpectedChannel,
  assertUploadApproval,
  mimeFor,
  parseArgs,
  validateMetadata,
} from '../scripts/youtube-uploader.mjs';

test('parseArgs handles values and safety flags', () => {
  assert.deepEqual(
    parseArgs(['--file', 'demo.mp4', '--approve-upload', '--metadata', 'demo.json']),
    { file: 'demo.mp4', 'approve-upload': true, metadata: 'demo.json' },
  );
});

test('metadata defaults to private and deduplicates tags', () => {
  assert.deepEqual(
    validateMetadata({ title: ' בדיקה ', description: 'תיאור', tags: ['KNX', 'KNX', ''] }),
    {
      title: 'בדיקה',
      description: 'תיאור',
      tags: ['KNX'],
      categoryId: '28',
      privacyStatus: 'private',
      selfDeclaredMadeForKids: false,
      defaultLanguage: 'he',
      defaultAudioLanguage: 'he',
    },
  );
});

test('metadata rejects an invalid privacy value', () => {
  assert.throws(() => validateMetadata({ title: 'בדיקה', privacyStatus: 'scheduled' }), /privacyStatus/);
});

test('channel guard accepts only the official I Feel channel', () => {
  assert.equal(assertExpectedChannel({ id: EXPECTED_CHANNEL_ID }).id, EXPECTED_CHANNEL_ID);
  assert.throws(() => assertExpectedChannel({ id: 'wrong-channel' }), /Safety stop/);
});

test('upload approval guard requires explicit approval and extra public approval', () => {
  const privateMetadata = validateMetadata({ title: 'בדיקה' });
  const publicMetadata = validateMetadata({ title: 'בדיקה', privacyStatus: 'public' });
  assert.throws(() => assertUploadApproval({}, privateMetadata), /approve-upload/);
  assert.doesNotThrow(() => assertUploadApproval({ 'approve-upload': true }, privateMetadata));
  assert.throws(() => assertUploadApproval({ 'approve-upload': true }, publicMetadata), /approve-public/);
  assert.doesNotThrow(() => assertUploadApproval({ 'approve-upload': true, 'approve-public': true }, publicMetadata));
});

test('mime type is inferred for supported video files', () => {
  assert.equal(mimeFor('demo.mp4'), 'video/mp4');
  assert.equal(mimeFor('demo.MOV'), 'video/quicktime');
  assert.throws(() => mimeFor('demo.bin'), /Unsupported video extension/);
});
