import fs from 'fs';
import path from 'path';
import { generatedBy } from '../shared/brand';
import { ensureDir, getLogsDir } from '../shared/paths';

/** Stacklet redis.conf next to redis-server.exe (Windows port has redis.windows.conf only). */
export function redisConfPath(installRoot: string): string {
  return path.join(installRoot, 'redis.conf');
}

function toRedisPath(p: string): string {
  return path.resolve(p).replace(/\\/g, '/');
}

export interface RedisConfOptions {
  /** requirepass value (empty/undefined = no auth). */
  password?: string;
  /** maxmemory cap, e.g. "256mb". */
  maxmemory?: string;
  /** maxmemory eviction policy, e.g. "allkeys-lru". */
  maxmemoryPolicy?: string;
  /** Enable the append-only persistence file. */
  appendonly?: boolean;
}

/**
 * Write redis.conf for the bundled Windows build (tporadowski/redis).
 * Idempotent — safe to call on install, apply, and manifest sync. Stacklet owns
 * this file, so user-managed settings (password, memory, persistence) are passed
 * in via `options` and re-emitted here rather than hand-edited.
 */
export function ensureRedisConfig(
  installRoot: string,
  port: number,
  options: RedisConfOptions = {},
): string {
  const dataDir = path.join(installRoot, 'data');
  const logDir = path.join(getLogsDir(), 'redis');
  ensureDir(dataDir);
  ensureDir(logDir);

  const confPath = redisConfPath(installRoot);
  const lines = [
    generatedBy('redis'),
    'bind 127.0.0.1',
    `port ${port}`,
    `dir ${toRedisPath(dataDir)}`,
    `logfile ${toRedisPath(path.join(logDir, 'redis.log'))}`,
    'daemonize no',
    'protected-mode yes',
  ];
  if (options.maxmemory && options.maxmemory.trim()) {
    lines.push(`maxmemory ${options.maxmemory.trim()}`);
  }
  if (options.maxmemoryPolicy && options.maxmemoryPolicy.trim()) {
    lines.push(`maxmemory-policy ${options.maxmemoryPolicy.trim()}`);
  }
  lines.push(`appendonly ${options.appendonly ? 'yes' : 'no'}`);
  if (options.password && options.password.trim()) {
    // requirepass forbids spaces in the bundled build; quote to be safe.
    lines.push(`requirepass "${options.password.trim().replace(/"/g, '')}"`);
  }
  lines.push('');

  fs.writeFileSync(confPath, lines.join('\n'), 'utf8');
  return confPath;
}
