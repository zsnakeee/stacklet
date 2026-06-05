/**
 * Unit tests for the privileged helper server.
 *
 * The server is tested without elevation — it is runnable as a normal Node
 * process; elevation is only required for the actual privileged ops (hosts
 * file, cert store). We use a random pipe name per test run so parallel
 * test processes do not collide.
 */

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { listenOnPipe } from '../pipe';
import { createHelperServer } from '../server';
import type { HelperRequest, HelperResponse } from '../protocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_TOKEN = 'test-token-abc123';

/**
 * Generate a unique pipe path for this test run.
 * On Windows, named pipes live in a flat namespace — make them unique.
 */
function testPipePath(): string {
  const suffix = process.pid + '-' + Date.now();
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\devmgr-test-${suffix}`;
  }
  // Unix: use a tmp socket so the tests also pass in CI (Linux/macOS runners).
  return `/tmp/devmgr-test-${suffix}.sock`;
}

/**
 * Send one JSON-line request to a connected socket and await the response line.
 */
function sendAndReceive(
  socket: net.Socket,
  request: HelperRequest,
): Promise<HelperResponse> {
  return new Promise((resolve, reject) => {
    let buf = '';

    const onData = (chunk: string) => {
      buf += chunk;
      const idx = buf.indexOf('\n');
      if (idx !== -1) {
        socket.off('data', onData);
        const line = buf.slice(0, idx).trim();
        try {
          resolve(JSON.parse(line) as HelperResponse);
        } catch {
          reject(new Error(`Bad JSON from server: ${line}`));
        }
      }
    };

    socket.setEncoding('utf8');
    socket.on('data', onData);
    socket.on('error', reject);
    socket.write(JSON.stringify(request) + '\n');
  });
}

/**
 * Connect a fresh TCP/pipe socket to `pipePath`.
 */
function connectSocket(pipePath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: pipePath });
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('HelperServer', () => {
  let server: net.Server;
  let PIPE: string;
  let hostsPath: string;
  let certPath: string;

  beforeAll(async () => {
    hostsPath = path.join(
      os.tmpdir(),
      `devmgr-server-hosts-${process.pid}-${Date.now()}.txt`,
    );
    process.env['DEVMGR_HOSTS_PATH'] = hostsPath;
    process.env['DEVMGR_MOCK_CERT'] = '1';

    certPath = path.join(os.tmpdir(), `devmgr-test-ca-${Date.now()}.crt`);
    fs.writeFileSync(certPath, '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----\n');

    PIPE = testPipePath();
    server = createHelperServer(TEST_TOKEN);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      listenOnPipe(server, PIPE, resolve);
    });
  });

  afterAll(async () => {
    delete process.env['DEVMGR_HOSTS_PATH'];
    delete process.env['DEVMGR_MOCK_CERT'];
    if (fs.existsSync(hostsPath)) fs.unlinkSync(hostsPath);
    if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // -------------------------------------------------------------------------
  // ping
  // -------------------------------------------------------------------------

  it('responds to a valid ping with ok: true and pong: true', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'ping',
        args: {},
        token: TEST_TOKEN,
      });
      expect(resp.ok).toBe(true);
      expect((resp.result as { pong: boolean }).pong).toBe(true);
    } finally {
      socket.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Token authentication
  // -------------------------------------------------------------------------

  it('rejects a request with an invalid token', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'ping',
        args: {},
        token: 'wrong-token',
      });
      expect(resp.ok).toBe(false);
      expect(resp.error).toMatch(/unauthorized/i);
    } finally {
      socket.destroy();
    }
  });

  it('rejects a request with an empty token', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'ping',
        args: {},
        token: '',
      });
      expect(resp.ok).toBe(false);
      expect(resp.error).toMatch(/unauthorized/i);
    } finally {
      socket.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Allow-list enforcement
  // -------------------------------------------------------------------------

  it('rejects an unknown op', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'evil:rm-rf',
        args: {},
        token: TEST_TOKEN,
      });
      expect(resp.ok).toBe(false);
      expect(resp.error).toMatch(/not permitted/i);
    } finally {
      socket.destroy();
    }
  });

  it('rejects an empty op string', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: '',
        args: {},
        token: TEST_TOKEN,
      });
      expect(resp.ok).toBe(false);
      expect(resp.error).toMatch(/not permitted/i);
    } finally {
      socket.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Allowed ops
  // -------------------------------------------------------------------------

  it('handles hosts:add with valid args', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'hosts:add',
        args: { hostname: 'myapp.test', ip: '127.0.0.1' },
        token: TEST_TOKEN,
      });
      expect(resp.ok).toBe(true);
      expect((resp.result as Record<string, unknown>)['hostname']).toBe('myapp.test');
    } finally {
      socket.destroy();
    }
  });

  it('handles hosts:remove with valid args', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'hosts:remove',
        args: { hostname: 'myapp.test' },
        token: TEST_TOKEN,
      });
      expect(resp.ok).toBe(true);
      expect((resp.result as Record<string, unknown>)['removed']).toBe(true);
    } finally {
      socket.destroy();
    }
  });

  it('handles cert:install with valid args', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'cert:install',
        args: { certPath },
        token: TEST_TOKEN,
      });
      expect(resp.ok).toBe(true);
      expect((resp.result as Record<string, unknown>)['installed']).toBe(true);
    } finally {
      socket.destroy();
    }
  });

  it('returns error for hosts:add with missing hostname', async () => {
    const socket = await connectSocket(PIPE);
    try {
      const resp = await sendAndReceive(socket, {
        op: 'hosts:add',
        args: {},
        token: TEST_TOKEN,
      });
      expect(resp.ok).toBe(false);
      expect(resp.error).toMatch(/hostname/i);
    } finally {
      socket.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Protocol robustness
  // -------------------------------------------------------------------------

  it('returns error for invalid JSON', async () => {
    const pipePath = PIPE;
    const socket = await connectSocket(pipePath);
    try {
      const resp = await new Promise<HelperResponse>((resolve, reject) => {
        let buf = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
          buf += chunk;
          const idx = buf.indexOf('\n');
          if (idx !== -1) {
            try {
              resolve(JSON.parse(buf.slice(0, idx).trim()) as HelperResponse);
            } catch {
              reject(new Error('Bad JSON from server'));
            }
          }
        });
        socket.on('error', reject);
        socket.write('this is not json\n');
      });
      expect(resp.ok).toBe(false);
      expect(resp.error).toMatch(/invalid json/i);
    } finally {
      socket.destroy();
    }
  });

  it('handles multiple sequential requests on the same connection', async () => {
    const socket = await connectSocket(PIPE);
    socket.setEncoding('utf8');

    try {
      const r1 = await sendAndReceive(socket, { op: 'ping', args: {}, token: TEST_TOKEN });
      const r2 = await sendAndReceive(socket, { op: 'ping', args: {}, token: TEST_TOKEN });

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    } finally {
      socket.destroy();
    }
  });

  it('returns responses in request order when multiple ops are in flight', async () => {
    const socket = await connectSocket(PIPE);
    socket.setEncoding('utf8');

    try {
      socket.write(
        JSON.stringify({
          op: 'hosts:add',
          args: { hostname: 'first.test', ip: '127.0.0.1' },
          token: TEST_TOKEN,
        }) + '\n',
      );
      socket.write(
        JSON.stringify({
          op: 'hosts:add',
          args: { hostname: 'second.test', ip: '127.0.0.1' },
          token: TEST_TOKEN,
        }) + '\n',
      );

      const readLine = (): Promise<HelperResponse> =>
        new Promise((resolve, reject) => {
          let buf = '';
          const onData = (chunk: string) => {
            buf += chunk;
            const idx = buf.indexOf('\n');
            if (idx !== -1) {
              socket.off('data', onData);
              resolve(JSON.parse(buf.slice(0, idx).trim()) as HelperResponse);
            }
          };
          socket.on('data', onData);
          socket.on('error', reject);
        });

      const r1 = await readLine();
      const r2 = await readLine();

      expect(r1.ok).toBe(true);
      expect((r1.result as { hostname: string }).hostname).toBe('first.test');
      expect(r2.ok).toBe(true);
      expect((r2.result as { hostname: string }).hostname).toBe('second.test');
    } finally {
      socket.destroy();
    }
  });
});
