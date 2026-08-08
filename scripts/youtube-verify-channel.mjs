#!/usr/bin/env node

import { assertExpectedChannel, getAccessToken, getMyChannel, parseArgs } from './youtube-common.mjs';

async function main() {
  const args = parseArgs(process.argv);
  const accessToken = await getAccessToken(args);
  const channel = assertExpectedChannel(await getMyChannel(accessToken), args);

  console.log(JSON.stringify({
    ok: true,
    channelId: channel.id,
    title: channel.title,
    handle: channel.customUrl || null,
  }, null, 2));
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
