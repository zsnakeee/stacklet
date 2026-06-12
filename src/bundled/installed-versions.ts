import fs from 'fs';
import path from 'path';
import type { BundledServiceId } from './types';
import { getInstallDir, getInstalledRecord } from './registry';
import { getServicesDir } from '../shared/paths';

/** Installed version folders on disk (may differ from manifest active record). */
export function listInstalledVersionDirs(id: BundledServiceId): string[] {
  const root = path.join(getServicesDir(), id);
  if (!fs.existsSync(root)) return [];

  const versions: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(root, entry.name);
    if (id === 'php' && !fs.existsSync(path.join(dir, 'php.exe'))) continue;
    versions.push(entry.name);
  }

  return versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export function getPhpInstallPath(version: string): string | null {
  const dir = getInstallDir('php', version);
  return fs.existsSync(path.join(dir, 'php.exe')) ? dir : null;
}

export function getActivePhpVersion(): string | null {
  return getInstalledRecord('php')?.version ?? null;
}

const VERSION_MARKERS: Partial<Record<BundledServiceId, string>> = {
  nginx: 'nginx.exe',
  apache: 'bin/httpd.exe',
  php: 'php.exe',
  mysql: 'bin/mysqld.exe',
  postgres: 'bin/pg_ctl.exe',
  redis: 'redis-server.exe',
  nodejs: 'node.exe',
  phpmyadmin: 'index.php',
  mailpit: 'mailpit.exe',
  mongodb: 'bin/mongod.exe',
  python: 'python.exe',
};

/** True when the version folder exists and contains the service binary (or index.php). */
function markerExists(dir: string, marker: string): boolean {
  return fs.existsSync(path.join(dir, marker));
}

export function isVersionInstalledOnDisk(id: BundledServiceId, version: string): boolean {
  const dir = getInstallDir(id, version);
  if (!fs.existsSync(dir)) return false;

  const marker = VERSION_MARKERS[id];
  if (!marker) return true;

  if (markerExists(dir, marker)) return true;

  if (id === 'mysql') {
    return markerExists(dir, 'mysqld.exe') || markerExists(dir, 'bin/mysqld.exe');
  }

  return false;
}
