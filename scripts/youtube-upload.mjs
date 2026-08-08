#!/usr/bin/env node

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { URL } from 'node:url';
import {
  assertExpectedChannel,
  getAccessToken,
  getMyChannel,
  parseArgs,
} from './youtube-common.mjs';

function required(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing required --${key}`);
  return value;
}

function parseTags(value = '') {
  return String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function uploadFile(sessionUrl, accessToken, filePath, mimeType, size) {
  return new Promise((resolve, reject) => {
    const url = new URL(sessionUrl);
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'PUT',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': mimeType,
        'content-length': size,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = text ? JSON.parse(text) : {}; }
        catch { data = { raw: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Video upload failed (${res.statusCode}): ${JSON.stringify(data)}`));
      });
    });

    req.on('error', reject);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.pipe(req);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const filePath = path.resolve(required(args, 'file'));
  const title = required(args, 'title');
  const description = args.description || '';
  const privacyStatus = String(args.privacy || 'private').toLowerCase();
  const categoryId = String(args.category || '28');
  const tags = parseTags(args.tags);
  const mimeType = args.mime || 'video/mp4';

  if (!['private', 'unlisted', 'public'].includes(privacyStatus)) {
    throw new Error('--privacy must be private, unlisted, or public.');
  }
  if (args.confirm !== 'yes' && args.confirm !== true) {
    throw new Error('Upload blocked. Re-run only after Oren approves metadata/privacy, with --confirm=yes.');
  }
  if (!fs.existsSync(filePath)) throw new Error(`Video file not found: ${filePath}`);

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);

  const accessToken = await getAccessToken(args);
  const channel = assertExpectedChannel(await getMyChannel(accessToken), args);

  console.log(`Verified channel: ${channel.title} ${channel.customUrl || ''} (${channel.id})`);
  console.log(`Preparing upload: ${title} [${privacyStatus}]`);

  const metadata = {
    snippet: {
      title,
      description,
      categoryId,
      ...(tags.length ? { tags } : {}),
      defaultLanguage: 'he',
      defaultAudioLanguage: 'he',
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  const initUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
  const initResponse = await fetch(initUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
      'x-upload-content-length': String(stat.size),
      'x-upload-content-type': mimeType,
    },
    body: JSON.stringify(metadata),
  });

  const initText = await initResponse.text();
  if (!initResponse.ok) {
    throw new Error(`Could not start resumable upload (${initResponse.status}): ${initText}`);
  }

  const sessionUrl = initResponse.headers.get('location');
  if (!sessionUrl) throw new Error('YouTube did not return a resumable upload URL.');

  const video = await uploadFile(sessionUrl, accessToken, filePath, mimeType, stat.size);
  if (!video.id) throw new Error(`Upload returned no video ID: ${JSON.stringify(video)}`);

  console.log(JSON.stringify({
    ok: true,
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    privacyStatus: video.status?.privacyStatus || privacyStatus,
    channelId: channel.id,
    channelTitle: channel.title,
  }, null, 2));
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
