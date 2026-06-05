import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMysqlSpawn, ensureMysqlReady, hasMysqlSystemTables } from '../mysql';

describe('mysql spawn', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-mysql-'));
    fs.mkdirSync(path.join(tmp, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'bin', 'mysqld.exe'), '');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('hasMysqlSystemTables requires real privilege tables', () => {
    expect(hasMysqlSystemTables(path.join(tmp, 'data'))).toBe(false);

    const mysqlDb = path.join(tmp, 'data', 'mysql');
    fs.mkdirSync(mysqlDb, { recursive: true });
    expect(hasMysqlSystemTables(path.join(tmp, 'data'))).toBe(false);

    fs.writeFileSync(path.join(mysqlDb, 'db.frm'), '');
    expect(hasMysqlSystemTables(path.join(tmp, 'data'))).toBe(true);
  });

  it('writes my.ini when system tables already exist', () => {
    const mysqld = path.join(tmp, 'bin', 'mysqld.exe');
    const dataDir = path.join(tmp, 'data');
    fs.mkdirSync(path.join(dataDir, 'mysql'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'mysql', 'db.frm'), '');

    const ini = ensureMysqlReady(mysqld, dataDir, 3306);
    expect(fs.existsSync(ini)).toBe(true);
    const content = fs.readFileSync(ini, 'utf8');
    expect(content).toContain('datadir=');
    expect(content).toContain('port=3306');
    expect(content).not.toContain('allow-no-password');
  });

  it('buildMysqlSpawn uses --defaults-file', () => {
    const dataDir = path.join(tmp, 'data');
    fs.mkdirSync(path.join(dataDir, 'mysql'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'mysql', 'global_priv.MAD'), '');

    const spawn = buildMysqlSpawn(path.join(tmp, 'bin', 'mysqld.exe'), dataDir, 3306);
    expect(spawn.args[0]).toMatch(/^--defaults-file=/);
    expect(spawn.cwd).toBe(path.join(tmp, 'bin'));
  });
});
