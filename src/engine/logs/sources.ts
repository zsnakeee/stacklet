import fs from 'fs';
import path from 'path';
import type { Site } from '../../config/types';
import { findLaravelLogPaths } from '../sites';
import { getLogsDir } from '../../shared/paths';

export interface LogSource {
  id: string;
  label: string;
  path: string;
  kind: 'apache' | 'nginx' | 'php' | 'mysql' | 'postgres' | 'redis' | 'site' | 'laravel';
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
