import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultNginxOptions,
  readDevMgrHttpConf,
  renderDevMgrHttpConf,
  writeDevMgrHttpConf,
} from '../nginx-configure';

describe('nginx-configure', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-nginx-cfg-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes http tuning snippet', () => {
    const file = writeDevMgrHttpConf({ client_max_body_size: '200M', keepalive_timeout: 65 });
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('client_max_body_size 200M');
    expect(content).toContain('gzip on');
  });

  it('reads snippet round-trip', () => {
    const opts = { ...defaultNginxOptions(), gzip: false, keepalive_timeout: 30 };
    const file = writeDevMgrHttpConf(opts);
    const read = readDevMgrHttpConf(file);
    expect(read.gzip).toBe(false);
    expect(read.keepalive_timeout).toBe(30);
    expect(renderDevMgrHttpConf(defaultNginxOptions())).toContain('client_max_body_size');
  });
});
