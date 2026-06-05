import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultMysqlIniOptions,
  readMysqlIniOptions,
  renderMyIniContent,
  writeMyIni,
} from '../mysql-configure';

describe('mysql-configure', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-mysql-ini-'));
    fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('renders common mysqld options', () => {
    const content = renderMyIniContent(tmp, path.join(tmp, 'data'), 3306, defaultMysqlIniOptions());
    expect(content).toContain('character-set-server=utf8mb4');
    expect(content).toContain('innodb_buffer_pool_size=128M');
    expect(content).toContain('max_allowed_packet=64M');
    expect(content).toContain('port=3306');
    expect(content).toContain('bind-address=127.0.0.1');
  });

  it('writes and reads my.ini round-trip', () => {
    const opts = { ...defaultMysqlIniOptions(), max_connections: 200, slow_query_log: true };
    const ini = writeMyIni(tmp, path.join(tmp, 'data'), 3307, opts);
    expect(fs.existsSync(ini)).toBe(true);
    const read = readMysqlIniOptions(ini);
    expect(read.max_connections).toBe(200);
    expect(read.slow_query_log).toBe(true);
    expect(read.character_set_server).toBe('utf8mb4');
  });
});
