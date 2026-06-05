import path from 'path';

/**
 * Shared protocol types for engine <-> privileged helper IPC.
 *
 * Transport: newline-delimited JSON over a Windows named pipe.
 * Each request and response is a single JSON line terminated by '\n'.
 */

/**
 * Bump when helper ops or allow-list change so the engine restarts a stale elevated process.
 */
export const HELPER_PROTOCOL_VERSION = 2;

/** Operations the privileged helper is permitted to execute. */
export type AllowedOp = 'hosts:add' | 'hosts:remove' | 'hosts:sync' | 'cert:install' | 'ping';

/** All ops accepted by the allow-list check (including ping for health-check). */
export const ALLOWED_OPS: ReadonlySet<string> = new Set<AllowedOp>([
  'hosts:add',
  'hosts:remove',
  'hosts:sync',
  'cert:install',
  'ping',
]);

/**
 * A request sent from the engine to the helper.
 *
 * @property op    - The operation to perform (must be in ALLOWED_OPS).
 * @property args  - Operation-specific arguments (arbitrary key/value pairs).
 * @property token - Shared secret read from %LOCALAPPDATA%\devmgr\helper.token.
 */
export interface HelperRequest {
  op: string;
  args: Record<string, unknown>;
  token: string;
}

/**
 * A response sent from the helper back to the engine.
 *
 * Exactly one of `result` or `error` will be set.
 */
export interface HelperResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Named pipe path used by both server and client. */
export const PIPE_PATH = '\\\\.\\pipe\\devmgr-helper';

/**
 * The token file location: %LOCALAPPDATA%\devmgr\helper.token
 * Falls back to a temp path on non-Windows for unit-test portability.
 */
export function getTokenPath(): string {
  const localAppData =
    process.env['LOCALAPPDATA'] ??
    process.env['TMPDIR'] ??
    process.env['TMP'] ??
    '/tmp';
  return path.join(localAppData, 'devmgr', 'helper.token');
}
