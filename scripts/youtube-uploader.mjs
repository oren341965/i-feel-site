import { createReadStream } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXPECTED_CHANNEL_ID = 'UC7nVAqqWJiFhp-EshK2vmMA';

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) throw new Error(`Unexpected argument: ${entry}`);
    const key = entry.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function mimeFor(filePath, explicitMime) {
  if (explicitMime) return explicitMime;
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
  };
  const mime = mimeTypes[extension];
  if (!mime) throw new Error(`Unsupported video extension ${extension || '(none)'}; pass --mime explicitly.`);
  return mime;
}

export function validateMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Metadata must be a JSON object.');
  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  if (!title) throw new Error('Metadata title is required.');
  if (Array.from(title).length > 100) throw new Error('YouTube titles must be at most 100 characters.');
  if (Array.from(description).length > 5000) throw new Error('YouTube descriptions must be at most 5,000 characters.');

  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean))]
    : [];
  const privacyStatus = input.privacyStatus ?? 'private';
  if (!['private', 'unlisted', 'public'].includes(privacyStatus)) {
    throw new Error('privacyStatus must be private, unlisted, or public.');
  }

  return {
    title,
    description,
    tags,
    categoryId: String(input.categoryId ?? '28'),
    privacyStatus,
    selfDeclaredMadeForKids: input.selfDeclaredMadeForKids === true,
    defaultLanguage: input.defaultLanguage ?? 'he',
    defaultAudioLanguage: input.defaultAudioLanguage ?? 'he',
  };
}

export function assertExpectedChannel(channel) {
  if (!channel?.id) throw new Error('The authorized Google account has no YouTube channel.');
  if (channel.id !== EXPECTED_CHANNEL_ID) {
    throw new Error(`Safety stop: authorized channel ${channel.id} is not the I Feel channel ${EXPECTED_CHANNEL_ID}.`);
  }
  return channel;
}

export function assertUploadApproval(args, metadata) {
  if (!args['approve-upload']) {
    throw new Error('Upload blocked: explicit --approve-upload is required after Oren approves metadata and visibility.');
  }
  if (metadata.privacyStatus === 'public' && !args['approve-public']) {
    throw new Error('Public upload blocked: --approve-public is also required.');
  }
}

async function loadLocalEnv(root) {
  let source;
  try {
    source = await readFile(path.join(root, '.env.local'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const allowed = new Set(['YOUTUBE_OAUTH_CLIENT_FILE', 'YOUTUBE_OAUTH_TOKEN_FILE']);
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!allowed.has(key) || process.env[key]) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function readOAuthFiles(clientPath, tokenPath) {
  const rawClient = JSON.parse(await readFile(clientPath, 'utf8'));
  const client = rawClient.installed ?? rawClient.web;
  if (!client?.client_id || !client?.client_secret) throw new Error('OAuth client JSON is invalid.');
  const token = JSON.parse(await readFile(tokenPath, 'utf8'));
  if (!token.refresh_token) throw new Error('OAuth token JSON has no refresh_token.');
  return { client, token };
}

async function refreshAccessToken(clientPath, tokenPath, fetchImpl = fetch) {
  const { client, token } = await readOAuthFiles(clientPath, tokenPath);
  const response = await fetchImpl(client.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const refreshed = await response.json();
  if (!response.ok || !refreshed.access_token) {
    throw new Error(`OAuth refresh failed (${response.status}): ${refreshed.error ?? 'unknown_error'}`);
  }
  const updated = {
    ...token,
    ...refreshed,
    refresh_token: token.refresh_token,
    refreshed_at: new Date().toISOString(),
  };
  const temporaryPath = `${tokenPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(updated, null, 2), { mode: 0o600 });
  await rename(temporaryPath, tokenPath);
  return refreshed.access_token;
}

async function readJsonResponse(response, context) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message ?? payload.error ?? response.statusText ?? 'unknown_error';
    throw new Error(`${context} failed (${response.status}): ${message}`);
  }
  return payload;
}

async function verifyChannel(accessToken, fetchImpl = fetch) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.search = new URLSearchParams({ part: 'id,snippet', mine: 'true' }).toString();
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await readJsonResponse(response, 'YouTube channel verification');
  return assertExpectedChannel(payload.items?.[0]);
}

async function uploadVideo({ accessToken, filePath, mime, metadata, fetchImpl = fetch }) {
  const file = await stat(filePath);
  if (!file.isFile() || file.size === 0) throw new Error('Video file is missing or empty.');

  const initUrl = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
  initUrl.search = new URLSearchParams({
    uploadType: 'resumable',
    part: 'snippet,status',
    notifySubscribers: 'false',
  }).toString();
  const initResponse = await fetchImpl(initUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(file.size),
      'X-Upload-Content-Type': mime,
    },
    body: JSON.stringify({
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.categoryId,
        defaultLanguage: metadata.defaultLanguage,
        defaultAudioLanguage: metadata.defaultAudioLanguage,
      },
      status: {
        privacyStatus: metadata.privacyStatus,
        selfDeclaredMadeForKids: metadata.selfDeclaredMadeForKids,
      },
    }),
  });
  if (!initResponse.ok) await readJsonResponse(initResponse, 'YouTube resumable-upload initialization');
  const uploadUrl = initResponse.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL.');

  const uploadResponse = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime, 'Content-Length': String(file.size) },
    body: createReadStream(filePath),
    duplex: 'half',
  });
  return readJsonResponse(uploadResponse, 'YouTube video upload');
}

function usage() {
  return [
    'Verify: npm run youtube:verify',
    'Upload: npm run youtube:upload -- --file <video> --metadata <metadata.json> --approve-upload',
    'Public upload also requires: --approve-public',
  ].join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const root = process.cwd();
  await loadLocalEnv(root);
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args['verify-channel'] && !args.upload) throw new Error(`Choose --verify-channel or --upload.\n${usage()}`);

  let uploadInput;
  if (args.upload) {
    if (!args.file || !args.metadata) throw new Error('--file and --metadata are required for upload.');
    const filePath = path.resolve(args.file);
    const metadata = validateMetadata(JSON.parse(await readFile(path.resolve(args.metadata), 'utf8')));
    assertUploadApproval(args, metadata);
    uploadInput = { filePath, metadata };
  }

  if (!process.env.YOUTUBE_OAUTH_CLIENT_FILE && !args.client) throw new Error('YOUTUBE_OAUTH_CLIENT_FILE is not configured.');
  if (!process.env.YOUTUBE_OAUTH_TOKEN_FILE && !args.token) throw new Error('YOUTUBE_OAUTH_TOKEN_FILE is not configured.');
  const clientPath = path.resolve(args.client ?? process.env.YOUTUBE_OAUTH_CLIENT_FILE);
  const tokenPath = path.resolve(args.token ?? process.env.YOUTUBE_OAUTH_TOKEN_FILE);

  const accessToken = await refreshAccessToken(clientPath, tokenPath);
  const channel = await verifyChannel(accessToken);
  if (args['verify-channel']) {
    console.log(JSON.stringify({ ok: true, channelId: channel.id, channelTitle: channel.snippet?.title ?? null }, null, 2));
    return;
  }

  const { filePath, metadata } = uploadInput;
  const video = await uploadVideo({
    accessToken,
    filePath,
    mime: mimeFor(filePath, args.mime),
    metadata,
  });
  console.log(JSON.stringify({
    ok: true,
    videoId: video.id,
    title: video.snippet?.title ?? metadata.title,
    privacyStatus: video.status?.privacyStatus ?? metadata.privacyStatus,
    watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
  }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(`[youtube-uploader] ${error.message}`);
    process.exitCode = 1;
  });
}
