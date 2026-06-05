/**
 * Privileged helper server.
 *
 * Runs as an elevated Node process. Creates a Windows named pipe at
 * \\.\pipe\devmgr-helper and listens for JSON-line requests from the engine.
 *
 * Security model:
 *   1. Token check   — every request must carry the shared secret.
 *   2. Allow-list    — only ops in ALLOWED_OPS are executed; all others rejected.
 *   3. No raw shell  — each op is a discrete function, never eval/exec of user input.
 *
 * Usage:
 *   node dist/helper/server.js
 *   (launched by elevate.ts via `Start-Process -Verb RunAs`)
 */

import net from 'net';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { installRootCert } from './cert';
import { hostsAdd, hostsRemove, hostsSync } from './hosts';
import { writeHelperPid } from './helper-process';
import { listenOnPipe } from './pipe';
import { PIPE_PATH, ALLOWED_OPS, HELPER_PROTOCOL_VERSION, getTokenPath } from './protocol';
import type { HelperRequest, HelperResponse } from './protocol';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Generate a 32-byte random hex token, write it to the token file,
 * and return it. The token file is readable only by the creating user
 * (we set mode 0o600 after writing).
 */
function generateAndWriteToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenPath = getTokenPath();
  const tokenDir = path.dirname(tokenPath);

  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }

  fs.writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  return token;
}

// ---------------------------------------------------------------------------
// Op handlers
// ---------------------------------------------------------------------------

/**
 * Dispatch table: op name → async handler function.
 * Each handler receives the `args` from the request and returns a result value.
 * Throw to signal failure — the server catches and turns it into { ok: false }.
 */
const opHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  ping: async (_args) => ({
    pong: true,
    pid: process.pid,
    protocolVersion: HELPER_PROTOCOL_VERSION,
  }),

  'hosts:add': async (args) => {
    const ip = String(args['ip'] ?? '127.0.0.1');
    const hostname = String(args['hostname'] ?? '');
    return hostsAdd(ip, hostname);
  },

  'hosts:remove': async (args) => {
    const hostname = String(args['hostname'] ?? '');
    return hostsRemove(hostname);
  },

  'hosts:sync': async (args) => {
    const ip = String(args['ip'] ?? '127.0.0.1');
    const raw = args['hostnames'];
    const hostnames = Array.isArray(raw)
      ? raw.map((h) => String(h))
      : String(raw ?? '')
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean);
    return hostsSync(hostnames, ip);
  },

  'cert:install': async (args) => {
    const certPath = String(args['certPath'] ?? '');
    return installRootCert(certPath);
  },
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function createHelperServer(sharedToken?: string): net.Server {
  // If no token is supplied (normal startup), generate one and write to disk.
  // Tests may pass a known token to avoid filesystem side-effects.
  const token = sharedToken ?? generateAndWriteToken();

  const server = net.createServer((socket) => {
    let buffer = '';
    let opChain: Promise<void> = Promise.resolve();

    socket.setEncoding('utf8');

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      // Process all complete newline-delimited messages in the buffer.
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        opChain = opChain
          .then(() => handleMessage(line, token, socket))
          .catch((err: unknown) => {
            console.error('[helper] request error:', err);
          });
      }
    });

    socket.on('error', (err) => {
      console.error('[helper] socket error:', err.message);
    });
  });

  server.on('error', (err) => {
    console.error('[helper] server error:', err.message);
    process.exit(1);
  });

  return server;
}

function sendResponse(socket: net.Socket, response: HelperResponse): void {
  try {
    socket.write(JSON.stringify(response) + '\n');
  } catch {
    // Socket may have closed; nothing we can do.
  }
}

async function handleMessage(
  rawLine: string,
  sharedToken: string,
  socket: net.Socket,
): Promise<void> {
  let request: HelperRequest;

  // 1. Parse JSON
  try {
    request = JSON.parse(rawLine) as HelperRequest;
  } catch {
    sendResponse(socket, { ok: false, error: 'invalid JSON' });
    return;
  }

  // 2. Token check
  if (!request.token || request.token !== sharedToken) {
    sendResponse(socket, { ok: false, error: 'unauthorized' });
    return;
  }

  // 3. Allow-list check
  if (!request.op || !ALLOWED_OPS.has(request.op)) {
    sendResponse(socket, {
      ok: false,
      error: `op '${request.op}' is not permitted`,
    });
    return;
  }

  // 4. Dispatch
  const handler = opHandlers[request.op];
  if (!handler) {
    // Theoretically unreachable — ALLOWED_OPS and opHandlers are kept in sync.
    sendResponse(socket, {
      ok: false,
      error: `op '${request.op}' has no handler`,
    });
    return;
  }

  try {
    const result = await handler(request.args ?? {});
    sendResponse(socket, { ok: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    sendResponse(socket, { ok: false, error: message });
  }
}

// ---------------------------------------------------------------------------
// Entry point (only when run directly, not when imported by tests)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const token = generateAndWriteToken();
  const tokenPath = getTokenPath();
  console.log(`[helper] token written to ${tokenPath}`);
  console.log(`[helper] pid ${process.pid}`);

  const server = createHelperServer(token);

  listenOnPipe(server, PIPE_PATH, () => {
    writeHelperPid();
    console.log(`[helper] listening on ${PIPE_PATH}`);
  });

  process.on('uncaughtException', (err) => {
    console.error('[helper] uncaughtException:', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    console.error('[helper] unhandledRejection:', err);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}
