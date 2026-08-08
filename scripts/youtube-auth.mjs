#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { exec } from 'node:child_process';
import { URL, URLSearchParams } from 'node:url';

const OAUTH_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const DEFAULT_TOKEN_PATH = '.youtube/token.json';

function parseArgs(argv) {
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

function loadClient(args) {
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

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(command, () => {});
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`OAuth token exchange failed: ${JSON.stringify(data)}`);
  if (!data.refresh_token) {
    throw new Error('Google did not return a refresh_token. Revoke the app grant and run authorization again with prompt=consent.');
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv);
  const { clientId, clientSecret } = loadClient(args);
  const tokenPath = path.resolve(args.output || DEFAULT_TOKEN_PATH);
  const port = Number(args.port || 53682);
  const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;

  await fs.promises.mkdir(path.dirname(tokenPath), { recursive: true });

  const server = http.createServer();
  const codePromise = new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      try {
        const url = new URL(req.url, redirectUri);
        if (url.pathname !== '/oauth2/callback') {
          res.writeHead(404).end('Not found');
          return;
        }
        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(`Authorization failed: ${error}`);
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }
        const code = url.searchParams.get('code');
        if (!code) throw new Error('Missing authorization code.');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h2>Authorization complete</h2><p>You can close this window and return to the terminal.</p>');
        resolve(code);
      } catch (err) {
        reject(err);
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  }).toString();

  console.log('\nOpen this URL in the Google account that manages @ifeelsmarthome:\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for Google authorization...\n');
  openBrowser(authUrl.toString());

  try {
    const code = await codePromise;
    const token = await exchangeCode({ clientId, clientSecret, code, redirectUri });
    const saved = {
      refresh_token: token.refresh_token,
      scope: token.scope,
      token_type: token.token_type,
      created_at: new Date().toISOString(),
    };
    await fs.promises.writeFile(tokenPath, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
    console.log(`Saved refresh token securely to: ${tokenPath}`);
    console.log('Next: run npm run youtube:verify to confirm the connected channel before uploading.');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
