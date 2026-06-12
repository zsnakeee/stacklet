import path from 'path';
import { getDataDir } from '../shared/paths';

/**
 * Shared protocol types for engine <-> privileged helper IPC.
 *
 * Transport: newline-delimited JSON over a Windows named pipe.
 * Each request and response is a single JSON line terminated by '\n'.
 */

/**
 * Bump when helper ops or allow-list change so the engine restarts a stale elevated process.
 * v3: renamed the pipe + token path from `devmgr` to `stacklet` — gives the renamed build a
 * fresh pipe so a leftover elevated `devmgr` helper (which a non-elevated engine cannot kill)
 * can no longer answer with a stale token.
 */
export const HELPER_PROTOCOL_VERSION = 3;

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
 * @property token - Shared secret read from <data-dir>\helper.token.
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
export const PIPE_PATH = '\\\\.\\pipe\\stacklet-helper';

/**
 * The token file location: <data-dir>\helper.token (alongside helper.pid).
 * Resolves via getDataDir() so it honors a moved/custom data directory and
 * stays consistent between the engine and the elevated helper process.
 */
export function getTokenPath(): string {
  return path.join(getDataDir(), 'helper.token');
}
