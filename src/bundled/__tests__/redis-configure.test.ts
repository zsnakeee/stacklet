import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureRedisConfig, redisConfPath } from '../redis-configure';

describe('ensureRedisConfig', () => {
  let dataDir: string;
  let installRoot: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-redis-cfg-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
    installRoot = path.join(dataDir, 'services', 'redis', '5.0.14.1');
    fs.mkdirSync(installRoot, { recursive: true });
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes redis.conf with port and data dir', () => {
    const conf = ensureRedisConfig(installRoot, 6379);
    expect(conf).toBe(redisConfPath(installRoot));
    expect(fs.existsSync(conf)).toBe(true);
    const text = fs.readFileSync(conf, 'utf8');
    expect(text).toContain('port 6379');
    expect(text).toContain('bind 127.0.0.1');
    expect(text).toContain(path.join(installRoot, 'data').replace(/\\/g, '/'));
    expect(fs.existsSync(path.join(installRoot, 'data'))).toBe(true);
  });
});
