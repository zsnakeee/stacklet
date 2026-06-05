import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensurePostgresPort, isPostgresCluster, readPostmasterPid } from '../postgres';

describe('postgres cluster', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-pg-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('isPostgresCluster requires PG_VERSION', () => {
    expect(isPostgresCluster(tmp)).toBe(false);
    fs.writeFileSync(path.join(tmp, 'PG_VERSION'), '17\n');
    expect(isPostgresCluster(tmp)).toBe(true);
  });

  it('readPostmasterPid reads the first line of postmaster.pid', () => {
    fs.writeFileSync(path.join(tmp, 'postmaster.pid'), '4242\n1234567890\n', 'utf8');
    expect(readPostmasterPid(tmp)).toBe(4242);
  });

  it('ensurePostgresPort updates postgresql.conf', () => {
    const conf = path.join(tmp, 'postgresql.conf');
    fs.writeFileSync(conf, '# dev-mgr\nport = 5432\n', 'utf8');
    ensurePostgresPort(tmp, 5433);
    expect(fs.readFileSync(conf, 'utf8')).toContain('port = 5433');
  });
});
