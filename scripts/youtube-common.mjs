import fs from 'node:fs';
import path from 'node:path';
import { URLSearchParams } from 'node:url';

export const DEFAULT_TOKEN_PATH = '.youtube/token.json';

export function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) out[key] = inlineValue;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

export function loadClient(args = {}) {
  if (args.credentials) {
    const json = JSON.parse(fs.readFileSync(args.credentials, 'utf8'));
    const cfg = json.installed || json.web;
    if (!cfg?.client_id || !cfg?.client_secret) {
      throw new Error('OAuth JSON must contain installed.client_id and installed.client_secret.');
    }
    return { clientId: cfg.client_id, clientSecret: cfg.client_secret };
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Provide --credentials=/path/to/client.json or set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.');
  }
  return { clientId, clientSecret };
}

export function loadRefreshToken(args = {}) {
  if (process.env.YOUTUBE_REFRESH_TOKEN) return process.env.YOUTUBE_REFRESH_TOKEN;
  const tokenPath = path.resolve(args.token || DEFAULT_TOKEN_PATH);
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  if (!token.refresh_token) throw new Error(`No refresh_token found in ${tokenPath}`);
  return token.refresh_token;
}

export async function getAccessToken(args = {}) {
  const { clientId, clientSecret } = loadClient(args);
  const refreshToken = loadRefreshToken(args);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Failed to refresh access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

export async function youtubeJson(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(`YouTube API ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function getMyChannel(accessToken) {
  const data = await youtubeJson(
    'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
    accessToken,
  );
  const channel = data.items?.[0];
  if (!channel) throw new Error('No YouTube channel found for the authorized Google account.');
  return {
    id: channel.id,
    title: channel.snippet?.title || '',
    customUrl: channel.snippet?.customUrl || '',
  };
}

export function assertExpectedChannel(channel, args = {}) {
  const expectedId = args['channel-id'] || process.env.YOUTUBE_CHANNEL_ID;
  const expectedHandle = (args.handle || process.env.YOUTUBE_CHANNEL_HANDLE || '@ifeelsmarthome').toLowerCase();

  if (expectedId && channel.id !== expectedId) {
    throw new Error(`Wrong YouTube channel. Expected ID ${expectedId}, got ${channel.id} (${channel.title}).`);
  }

  if (!expectedId && expectedHandle) {
    const actual = String(channel.customUrl || '').toLowerCase();
    if (actual && actual !== expectedHandle) {
      throw new Error(`Wrong YouTube channel. Expected ${expectedHandle}, got ${actual} (${channel.title}).`);
    }
  }

  return channel;
}
