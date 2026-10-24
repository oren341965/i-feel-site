import { stat } from 'node:fs/promises';

// A successful STOR response alone does not establish that the remote file is complete.
// SIZE failure or mismatch must reach the caller's existing bounded retry loop.
export async function uploadFileVerified(client, localPath, remoteName) {
  const { size: expectedBytes } = await stat(localPath);
  await client.uploadFrom(localPath, remoteName);
  const actualBytes = await client.size(remoteName);
  if (!Number.isSafeInteger(actualBytes) || actualBytes !== expectedBytes) {
    throw new Error(`FTPS size mismatch for '${remoteName}': expected ${expectedBytes} bytes, got ${actualBytes}.`);
  }
}
