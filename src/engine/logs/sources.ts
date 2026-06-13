import fs from 'fs';
import path from 'path';
import type { Site } from '../../config/types';
import { findLaravelLogPaths } from '../sites';
import { getLogsDir, getServicesDir } from '../../shared/paths';

/** Map a service folder name under \services to a log kind + label. */
const SERVICE_LOG_KINDS: Record<string, { kind: LogSource['kind']; label: string }> = {
  nginx: { kind: 'nginx', label: 'Nginx' },
  apache: { kind: 'apache', label: 'Apache' },
  mysql: { kind: 'mysql', label: 'MySQL' },
  mariadb: { kind: 'mysql', label: 'MariaDB' },
  postgres: { kind: 'postgres', label: 'PostgreSQL' },
  postgresql: { kind: 'postgres', label: 'PostgreSQL' },
  redis: { kind: 'redis', label: 'Redis' },
  mongodb: { kind: 'mongodb', label: 'MongoDB' },
  mailpit: { kind: 'mailpit', label: 'Mailpit' },
};

/** Collect *.log files from each installed service's own \services\<svc>\<ver>\logs dir. */
function pushServiceInstallLogs(sources: LogSource[]): void {
  const servicesDir = getServicesDir();
  if (!fs.existsSync(servicesDir)) return;
  for (const svc of fs.readdirSync(servicesDir, { withFileTypes: true })) {
    if (!svc.isDirectory()) continue;
    const meta = SERVICE_LOG_KINDS[svc.name.toLowerCase()];
    if (!meta) continue;
    const svcDir = path.join(servicesDir, svc.name);
    for (const ver of fs.readdirSync(svcDir, { withFileTypes: true })) {
      if (!ver.isDirectory()) continue;
      // Logs usually live in <ver>\logs; some services log in the version root.
      for (const sub of ['logs', '']) {
        const dir = sub ? path.join(svcDir, ver.name, sub) : path.join(svcDir, ver.name);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          if (!file.endsWith('.log')) continue;
          const full = path.join(dir, file);
          sources.push({
            id: `svc:${svc.name}:${ver.name}:${sub || 'root'}:${file.replace(/\.log$/, '')}`,
            label: `${meta.label} ${ver.name} ${file}`,
            path: full,
            kind: meta.kind,
          });
        }
      }
    }
  }
}

export interface LogSource {
  id: string;
  label: string;
  path: string;
  kind:
    | 'apache'
    | 'nginx'
    | 'php'
    | 'mysql'
    | 'postgres'
    | 'redis'
    | 'mongodb'
    | 'mailpit'
    | 'site'
    | 'laravel';
}

function pushGlob(
  sources: LogSource[],
  idPrefix: string,
  labelPrefix: string,
  dir: string,
  kind: LogSource['kind'],
): void {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.log')) continue;
    const full = path.join(dir, file);
    const id = `${idPrefix}:${file.replace(/\.log$/, '')}`;
    sources.push({
      id,
      label: `${labelPrefix} ${file}`,
      path: full,
      kind,
    });
  }
}

export function buildLogSources(sites: Site[], phpVersion: string): LogSource[] {
  const sources: LogSource[] = [];
  const logsDir = getLogsDir();

  pushGlob(sources, 'apache', 'Apache', path.join(logsDir, 'apache'), 'apache');
  pushGlob(sources, 'nginx', 'Nginx', path.join(logsDir, 'nginx'), 'nginx');
  pushGlob(sources, 'mysql', 'MySQL', path.join(logsDir, 'mysql'), 'mysql');
  pushGlob(sources, 'postgres', 'PostgreSQL', path.join(logsDir, 'postgres'), 'postgres');
  pushGlob(sources, 'redis', 'Redis', path.join(logsDir, 'redis'), 'redis');

  // Each service also writes logs inside its own install dir (\services\<svc>\<ver>\logs).
  pushServiceInstallLogs(sources);
  pushGlob(
    sources,
    `php:${phpVersion}`,
    `PHP ${phpVersion}`,
    path.join(logsDir, 'php', phpVersion),
    'php',
  );

  for (const site of sites) {
    const siteDir = path.join(logsDir, 'sites', site.name);
    for (const file of ['access.log', 'error.log']) {
      sources.push({
        id: `site:${site.name}:${file.replace('.log', '')}`,
        label: `${site.hostname} ${file}`,
        path: path.join(siteDir, file),
        kind: 'site',
      });
    }

    for (const laravelPath of findLaravelLogPaths(site)) {
      const base = path.basename(laravelPath);
      sources.push({
        id: `laravel:${site.name}:${base}`,
        label: `${site.hostname} ${base}`,
        path: laravelPath,
        kind: 'laravel',
      });
    }
  }

  return sources;
}
