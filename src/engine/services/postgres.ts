import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureDir, getLogsDir } from '../../shared/paths';

export interface PostgresSpawnOptions {
  args: string[];
  cwd: string;
}

/** True when initdb has created a cluster (PG_VERSION is present). */
export function isPostgresCluster(dataDir: string): boolean {
  return fs.existsSync(path.join(dataDir, 'PG_VERSION'));
}

/** PID written by the postmaster after pg_ctl start (pg_ctl itself exits). */
export function readPostmasterPid(dataDir: string): number | undefined {
  const file = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(file)) return undefined;
  const firstLine = fs.readFileSync(file, 'utf8').split(/\r?\n/)[0]?.trim();
  const pid = Number(firstLine);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

function findInitdbExe(pgCtlBinary: string): string | null {
  const initdb = path.join(path.dirname(pgCtlBinary), 'initdb.exe');
  return fs.existsSync(initdb) ? initdb : null;
}

function clearNonClusterDataDir(dataDir: string): void {
  if (!fs.existsSync(dataDir)) return;
  if (isPostgresCluster(dataDir)) return;
  const entries = fs.readdirSync(dataDir);
  if (entries.length === 0) return;
  fs.rmSync(dataDir, { recursive: true, force: true });
}

function runInitdb(initdb: string, dataDir: string, binDir: string): void {
  ensureDir(dataDir);
  const result = spawnSync(
    initdb,
    ['-D', dataDir, '-U', 'postgres', '-E', 'UTF8', '--locale=C', '-A', 'trust'],
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
        ? `PostgreSQL data directory initialization failed:\n${out}`
        : `PostgreSQL data directory initialization failed (exit ${result.status ?? 'unknown'})`,
    );
  }

  if (!isPostgresCluster(dataDir)) {
    throw new Error('PostgreSQL initdb finished but PG_VERSION is missing');
  }
}

/** Run initdb when data/ exists but is not yet a database cluster. */
export function ensurePostgresReady(pgCtlBinary: string, dataDir: string): void {
  if (!pgCtlBinary || !fs.existsSync(pgCtlBinary)) {
    throw new Error('postgres: pg_ctl.exe not configured or missing');
  }
  if (isPostgresCluster(dataDir)) return;

  const initdb = findInitdbExe(pgCtlBinary);
  if (!initdb) {
    throw new Error('postgres: initdb.exe not found next to pg_ctl.exe');
  }

  clearNonClusterDataDir(dataDir);
  runInitdb(initdb, dataDir, path.dirname(pgCtlBinary));
}

export function ensurePostgresPort(dataDir: string, port: number): void {
  const confPath = path.join(dataDir, 'postgresql.conf');
  if (!fs.existsSync(confPath)) return;

  let text = fs.readFileSync(confPath, 'utf8');
  if (/^port\s*=/m.test(text)) {
    text = text.replace(/^port\s*=.*/m, `port = ${port}`);
  } else {
    const suffix = text.endsWith('\n') ? '' : '\n';
    text = `${text}${suffix}port = ${port}\n`;
  }
  fs.writeFileSync(confPath, text, 'utf8');
}

export function buildPostgresSpawn(
  pgCtlBinary: string,
  dataDir: string,
  port: number,
): PostgresSpawnOptions {
  ensurePostgresReady(pgCtlBinary, dataDir);
  ensurePostgresPort(dataDir, port);

  ensureDir(path.join(getLogsDir(), 'postgres'));
  const logFile = path.join(getLogsDir(), 'postgres', 'server.log');

  return {
    args: ['-D', dataDir, '-o', `-p ${port}`, '-l', logFile, 'start'],
    cwd: path.dirname(pgCtlBinary),
  };
}
