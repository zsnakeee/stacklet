import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { mergeMysqlIniOptions, writeMyIni as writeMysqlIni } from '../../bundled/mysql-configure';
import type { MysqlIniOptions } from '../../config/types';
import { ensureDir } from '../../shared/paths';

export interface MysqlSpawnOptions {
  args: string[];
  cwd: string;
}

const SYSTEM_TABLE_MARKERS = [
  'db.frm',
  'db.MAD',
  'global_priv.frm',
  'global_priv.MAD',
  'user.frm',
  'user.MAD',
  'plugin.frm',
  'plugin.MAD',
  'servers.frm',
  'servers.MAD',
];

function writeMyIni(
  installRoot: string,
  dataDir: string,
  port: number,
  options?: Partial<MysqlIniOptions>,
): string {
  return writeMysqlIni(installRoot, dataDir, port, options);
}

/** True when mysql system schema and privilege tables exist. */
export function hasMysqlSystemTables(dataDir: string): boolean {
  const mysqlDb = path.join(dataDir, 'mysql');
  if (!fs.existsSync(mysqlDb)) return false;

  for (const marker of SYSTEM_TABLE_MARKERS) {
    if (fs.existsSync(path.join(mysqlDb, marker))) return true;
  }

  const entries = fs.readdirSync(mysqlDb).filter((e) => !e.startsWith('.'));
  return entries.length >= 5;
}

function clearDataDir(dataDir: string): void {
  if (!fs.existsSync(dataDir)) return;
  for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
    const full = path.join(dataDir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    } else {
      fs.unlinkSync(full);
    }
  }
}

function findInstallDbExe(binDir: string): string | null {
  for (const name of ['mariadb-install-db.exe', 'mysql_install_db.exe']) {
    const p = path.join(binDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function runInstallDb(
  installDbExe: string,
  installRoot: string,
  dataDir: string,
  port: number,
): void {
  ensureDir(dataDir);
  const result = spawnSync(
    installDbExe,
    [
      `--datadir=${dataDir}`,
      `--port=${port}`,
      '--password=',
      '--default-user',
      '--allow-remote-root-access',
    ],
    {
      cwd: path.dirname(installDbExe),
      windowsHide: true,
      encoding: 'utf8',
      timeout: 120_000,
    },
  );

  if (result.status !== 0) {
    const out = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      out
        ? `MariaDB install-db failed:\n${out}`
        : `MariaDB install-db failed (exit ${result.status ?? 'unknown'})`,
    );
  }

  writeMyIni(installRoot, dataDir, port, {});
}

function runInitialize(mysqldBinary: string, installRoot: string, dataDir: string, port: number): void {
  ensureDir(dataDir);
  const defaultsFile = writeMyIni(installRoot, dataDir, port, {});
  const binDir = path.dirname(mysqldBinary);

  const result = spawnSync(
    mysqldBinary,
    [`--defaults-file=${defaultsFile}`, '--initialize-insecure'],
    {
      cwd: binDir,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 120_000,
    },
  );

  if (result.status !== 0) {
    const out = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      out
        ? `MariaDB data directory initialization failed:\n${out}`
        : `MariaDB data directory initialization failed (exit ${result.status ?? 'unknown'})`,
    );
  }
}

function initializeDataDir(
  mysqldBinary: string,
  installRoot: string,
  dataDir: string,
  port: number,
): void {
  clearDataDir(dataDir);

  const binDir = path.dirname(mysqldBinary);
  const installDb = findInstallDbExe(binDir);
  if (installDb) {
    runInstallDb(installDb, installRoot, dataDir, port);
    return;
  }

  runInitialize(mysqldBinary, installRoot, dataDir, port);
}

/** Create my.ini and initialize data/ when system tables are missing. */
export function ensureMysqlReady(
  mysqldBinary: string,
  dataDir: string,
  port: number,
  options?: Partial<MysqlIniOptions>,
): string {
  const installRoot = path.resolve(dataDir, '..');

  if (!hasMysqlSystemTables(dataDir)) {
    initializeDataDir(mysqldBinary, installRoot, dataDir, port);
  }

  return writeMyIni(installRoot, dataDir, port, mergeMysqlIniOptions(options));
}

/** PID of a process listening on TCP port (Windows netstat). */
export function findPidListeningOnPort(port: number): number | undefined {
  if (process.platform !== 'win32') return undefined;

  const result = spawnSync('netstat', ['-ano'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const lines = (result.stdout ?? '').split(/\r?\n/);
  const portToken = `:${port}`;

  for (const line of lines) {
    if (!line.includes('LISTENING') || !line.includes(portToken)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0) return pid;
  }
  return undefined;
}

function findMysqlClientExe(binDir: string): string | null {
  for (const name of ['mysql.exe', 'mariadb.exe']) {
    const p = path.join(binDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** MariaDB 10.11+ rejects empty passwords unless allow_no_password is enabled. */
export function enableMysqlAllowNoPassword(
  mysqldBinary: string,
  defaultsFile: string,
): void {
  const client = findMysqlClientExe(path.dirname(mysqldBinary));
  if (!client) return;

  const result = spawnSync(
    client,
    [
      `--defaults-file=${defaultsFile}`,
      '-h',
      '127.0.0.1',
      '-u',
      'root',
      '-e',
      'SET GLOBAL allow_no_password=ON;',
    ],
    {
      cwd: path.dirname(mysqldBinary),
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15_000,
    },
  );

  if (result.status !== 0) {
    const out = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    if (out && !/allow_no_password/i.test(out)) {
      // Non-fatal: install-db may already permit local root login
    }
  }
}

export function buildMysqlSpawn(
  mysqldBinary: string,
  dataDir: string,
  port: number,
  options?: Partial<MysqlIniOptions>,
): MysqlSpawnOptions {
  if (!mysqldBinary || !fs.existsSync(mysqldBinary)) {
    throw new Error('mysql: mysqld.exe not configured or missing');
  }

  const defaultsFile = ensureMysqlReady(mysqldBinary, dataDir, port, options);
  const binDir = path.dirname(mysqldBinary);

  return {
    args: [`--defaults-file=${defaultsFile}`],
    cwd: binDir,
  };
}
