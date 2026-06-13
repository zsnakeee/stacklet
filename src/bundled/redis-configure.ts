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

/**
 * Write redis.conf for the bundled Windows build (tporadowski/redis).
 * Idempotent — safe to call on install, apply, and manifest sync.
 */
export function ensureRedisConfig(installRoot: string, port: number): string {
  const dataDir = path.join(installRoot, 'data');
  const logDir = path.join(getLogsDir(), 'redis');
  ensureDir(dataDir);
  ensureDir(logDir);

  const confPath = redisConfPath(installRoot);
  const content = [
    generatedBy('redis'),
    'bind 127.0.0.1',
    `port ${port}`,
    `dir ${toRedisPath(dataDir)}`,
    `logfile ${toRedisPath(path.join(logDir, 'redis.log'))}`,
    'daemonize no',
    'protected-mode yes',
    '',
  ].join('\n');

  fs.writeFileSync(confPath, content, 'utf8');
  return confPath;
}
