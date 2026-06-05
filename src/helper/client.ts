/**
 * Engine-side named pipe client.
 *
 * Connects to the privileged helper over \\.\pipe\devmgr-helper,
 * reads the shared token from %LOCALAPPDATA%\devmgr\helper.token,
 * and exposes typed async methods for each allowed op.
 *
 * Usage:
 *   const client = new HelperClient();
 *   await client.connect();
 *   const pong = await client.ping();
 *   await client.disconnect();
 */

import net from 'net';
import fs from 'fs';
import { PIPE_PATH, HELPER_PROTOCOL_VERSION, getTokenPath } from './protocol';
import type { HelperRequest, HelperResponse } from './protocol';

// ---------------------------------------------------------------------------
// Pending-request bookkeeping
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (response: HelperResponse) => void;
  reject: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// HelperClient
// ---------------------------------------------------------------------------

export class HelperClient {
  private socket: net.Socket | null = null;
  private token: string = '';
  private buffer: string = '';
  private pending: PendingRequest[] = [];
  private connected: boolean = false;
  /** Bumped on each connect/disconnect so stale socket events are ignored. */
  private sessionId = 0;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Read the shared token from disk. Call before connect(). */
  loadToken(): void {
    const tokenPath = getTokenPath();
    if (!fs.existsSync(tokenPath)) {
      throw new Error(
        `Helper token not found at ${tokenPath}. Is the helper running?`,
      );
    }
    this.token = fs.readFileSync(tokenPath, 'utf8').trim();
  }

  /**
   * Connect to the named pipe.
   * Rejects if the helper is not running or connection times out.
   */
  connect(timeoutMs: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      this.teardownSocket(false);

      const sessionId = ++this.sessionId;
      this.buffer = '';
      this.pending = [];

      const socket = net.createConnection({ path: PIPE_PATH });
      const timer = setTimeout(() => {
        if (sessionId !== this.sessionId) return;
        socket.destroy();
        reject(new Error('Helper connection timed out'));
      }, timeoutMs);

      socket.setEncoding('utf8');

      socket.once('connect', () => {
        if (sessionId !== this.sessionId) {
          socket.destroy();
          return;
        }
        clearTimeout(timer);
        this.socket = socket;
        this.connected = true;
        resolve();
      });

      socket.once('error', (err) => {
        if (sessionId !== this.sessionId) return;
        clearTimeout(timer);
        reject(err);
      });

      socket.on('data', (chunk: string) => {
        if (sessionId !== this.sessionId) return;
        this.buffer += chunk;
        let newlineIdx: number;
        while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, newlineIdx).trim();
          this.buffer = this.buffer.slice(newlineIdx + 1);
          if (!line) continue;
          this.handleResponse(line);
        }
      });

      socket.on('close', () => {
        if (sessionId !== this.sessionId) return;
        this.rejectInflight(new Error('Helper connection closed unexpectedly'));
        this.connected = false;
        this.socket = null;
      });

      socket.on('error', (err) => {
        if (sessionId !== this.sessionId) return;
        this.rejectInflight(err);
      });
    });
  }

  /** Close the connection; destroys the socket so late events cannot corrupt a reconnect. */
  disconnect(): void {
    this.teardownSocket(true);
  }

  private teardownSocket(rejectPending: boolean): void {
    this.sessionId += 1;
    this.connected = false;
    if (rejectPending) {
      this.rejectInflight(new Error('Helper disconnected'));
    } else {
      this.pending = [];
    }
    this.buffer = '';
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
  }

  private rejectInflight(err: Error): void {
    const inflight = this.pending.splice(0);
    for (const p of inflight) {
      p.reject(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Low-level send
  // ---------------------------------------------------------------------------

  /**
   * Send a request and await a single response.
   * Requests are queued in FIFO order matching the server's response order.
   */
  send(op: string, args: Record<string, unknown> = {}): Promise<HelperResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Not connected to helper'));
        return;
      }

      const request: HelperRequest = { op, args, token: this.token };

      this.pending.push({ resolve, reject });

      try {
        this.socket.write(JSON.stringify(request) + '\n');
      } catch (err) {
        this.pending.pop();
        reject(err);
      }
    });
  }

  private handleResponse(line: string): void {
    const next = this.pending.shift();
    if (!next) {
      console.warn('[helper-client] unexpected response (no pending request):', line);
      return;
    }

    try {
      const response = JSON.parse(line) as HelperResponse;
      next.resolve(response);
    } catch {
      next.reject(new Error(`Invalid JSON from helper: ${line}`));
    }
  }

  // ---------------------------------------------------------------------------
  // Typed op methods
  // ---------------------------------------------------------------------------

  /** Health-check — returns pong, pid, and protocol version. */
  async ping(): Promise<{
    pong: boolean;
    pid: number;
    protocolVersion: number;
  }> {
    const resp = await this.send('ping');
    if (!resp.ok) throw new Error(resp.error ?? 'ping failed');
    const result = resp.result as {
      pong: boolean;
      pid: number;
      protocolVersion?: number;
    };
    return {
      pong: result.pong,
      pid: result.pid,
      protocolVersion: result.protocolVersion ?? 0,
    };
  }

  /** True when the connected helper supports the current engine protocol. */
  isCurrentProtocol(ping: { protocolVersion: number }): boolean {
    return ping.protocolVersion === HELPER_PROTOCOL_VERSION;
  }

  /**
   * Add a hostname → IP entry to the system hosts file.
   * @param hostname  e.g. "myapp.test"
   * @param ip        e.g. "127.0.0.1" (default)
   */
  async hostsAdd(hostname: string, ip: string = '127.0.0.1'): Promise<void> {
    const resp = await this.send('hosts:add', { hostname, ip });
    if (!resp.ok) throw new Error(resp.error ?? 'hosts:add failed');
  }

  /**
   * Remove all entries for a hostname from the system hosts file.
   * @param hostname  e.g. "myapp.test"
   */
  async hostsRemove(hostname: string): Promise<void> {
    const resp = await this.send('hosts:remove', { hostname });
    if (!resp.ok) throw new Error(resp.error ?? 'hosts:remove failed');
  }

  /** Sync all *.test hostnames into the devmgr hosts block in one write. */
  async hostsSync(hostnames: string[], ip: string = '127.0.0.1'): Promise<void> {
    const resp = await this.send('hosts:sync', { hostnames, ip });
    if (!resp.ok) throw new Error(resp.error ?? 'hosts:sync failed');
  }

  /**
   * Install a certificate into the Windows trusted root store.
   * @param certPath  Absolute path to the .crt / .pem file.
   */
  async certInstall(certPath: string): Promise<void> {
    const resp = await this.send('cert:install', { certPath });
    if (!resp.ok) throw new Error(resp.error ?? 'cert:install failed');
  }

  // Expose connection state for introspection / tests
  get isConnected(): boolean {
    return this.connected;
  }
}
