import net from 'node:net';
import { pathToFileURL } from 'node:url';

export const PIPE = '\\\\.\\pipe\\ifeel-maya-whatsapp-run-lock-v1';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const validOwner = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);

// The OS owns exclusivity. No files, credentials, or customer content are stored.
// Expiration invalidates permission to act, but deliberately DOES NOT free the
// lock: a slow previous run must release its own lock or end its holder process.
export function hold(owner, { pipe = PIPE, ttlMs = 240000, output = emit } = {}) {
  if (!validOwner(owner)) throw new Error('INVALID_RUN_KEY');
  const expiresAt = Date.now() + ttlMs;
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.setTimeout(2000, () => socket.destroy());
    let data = '';
    socket.on('data', chunk => {
      data += chunk;
      if (data.length > 512) return socket.destroy();
      if (!data.includes('\n')) return;
      socket.removeAllListeners('data');
      let request;
      try { request = JSON.parse(data.trim()); } catch { return socket.destroy(); }
      if (request.owner !== owner) return socket.end(JSON.stringify({status:'NOT_OWNER'}) + '\n');
      if (request.action === 'release') {
        socket.end(JSON.stringify({status:'RELEASED'}) + '\n');
        server.close();
        return;
      }
      const remainingMs = expiresAt - Date.now();
      socket.end(JSON.stringify({status:remainingMs >= 20000 ? 'LOCK_VALID' : 'LOCK_EXPIRED', remainingMs:Math.max(0,remainingMs), expiresAt:new Date(expiresAt).toISOString()}) + '\n');
    });
  });
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipe, () => {
      output({status:'LOCK_ACQUIRED', runKey:owner, expiresAt:new Date(expiresAt).toISOString(), pid:process.pid});
      resolve();
    });
  });
  return {ready, close:() => { for (const socket of sockets) socket.destroy(); server.close(); }};
}

export function request(action, owner, pipe = PIPE) {
  if (!validOwner(owner) || !['check','release'].includes(action)) throw new Error('INVALID_ARGUMENTS');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipe);
    let data = '';
    socket.setTimeout(2500, () => socket.destroy(new Error('LOCK_CHECK_TIMEOUT')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify({action,owner}) + '\n'));
    socket.on('data', chunk => { data += chunk; if (data.length > 1024) socket.destroy(new Error('INVALID_LOCK_RESPONSE')); });
    socket.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('INVALID_LOCK_RESPONSE')); } });
  });
}

async function main() {
  if (process.env.COMPUTERNAME !== 'DESKTOP-3LU7BMR') throw new Error('WRONG_WORKSTATION');
  const [action,owner] = process.argv.slice(2);
  if (action === 'hold') {
    const holder = hold(owner);
    await holder.ready;
    // A signal/terminated exec session releases the OS pipe automatically.
    process.on('SIGINT', () => holder.close());
    process.on('SIGTERM', () => holder.close());
  } else {
    const result = await request(action,owner);
    emit(result);
    if (!['LOCK_VALID','RELEASED'].includes(result.status)) process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { emit({status:error.code === 'EADDRINUSE' ? 'LOCKED' : 'LOCK_UNAVAILABLE', code:error.code || error.message}); process.exitCode=2; });
}
