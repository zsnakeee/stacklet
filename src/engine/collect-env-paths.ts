import fs from 'fs';
import path from 'path';
import type { DevConfig } from '../config/types';
import { getComposerDir, getComposerStatus } from './composer';

export interface EnvPathCandidate {
  id: string;
  label: string;
  path: string;
  service: string;
}

function resolveBinDir(binary: string): string | null {
  const trimmed = binary?.trim();
  if (!trimmed) return null;
  const resolved = path.resolve(trimmed);
  if (!fs.existsSync(resolved)) return null;
  return fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
}

function addCandidate(
  candidates: EnvPathCandidate[],
  seen: Set<string>,
  entry: Omit<EnvPathCandidate, 'path'> & { dir: string | null },
): void {
  if (!entry.dir) return;
  const norm = path.normalize(entry.dir);
  if (seen.has(norm)) return;
  seen.add(norm);
  candidates.push({
    id: entry.id,
    label: entry.label,
    path: norm,
    service: entry.service,
  });
}

/** All PATH entries that can be added from installed bundled services. */
export function listEnvPathCandidates(config: DevConfig): EnvPathCandidate[] {
  const candidates: EnvPathCandidate[] = [];
  const seen = new Set<string>();
  const s = config.services;

  if (s.nginx.enabled) {
    addCandidate(candidates, seen, {
      id: 'nginx:bin',
      label: 'Nginx',
      service: 'nginx',
      dir: resolveBinDir(s.nginx.binary),
    });
  }
  if (s.php.enabled) {
    const ver = s.php.version || s.php.installed_version || 'PHP';
    addCandidate(candidates, seen, {
      id: 'php:bin',
      label: `PHP ${ver}`,
      service: 'php',
      dir: resolveBinDir(s.php.php_binary),
    });
    addCandidate(candidates, seen, {
      id: 'php:fpm',
      label: `PHP-FPM ${ver}`,
      service: 'php',
      dir: resolveBinDir(s.php.fpm_binary),
    });
  }
  if (s.mysql.enabled) {
    addCandidate(candidates, seen, {
      id: 'mysql:bin',
      label: 'MySQL',
      service: 'mysql',
      dir: resolveBinDir(s.mysql.binary),
    });
  }
  if (s.postgres.enabled) {
    addCandidate(candidates, seen, {
      id: 'postgres:bin',
      label: 'PostgreSQL',
      service: 'postgres',
      dir: resolveBinDir(s.postgres.binary),
    });
  }
  if (s.redis.enabled) {
    addCandidate(candidates, seen, {
      id: 'redis:bin',
      label: 'Redis',
      service: 'redis',
      dir: resolveBinDir(s.redis.binary),
    });
  }
  if (s.nodejs.enabled) {
    addCandidate(candidates, seen, {
      id: 'nodejs:bin',
      label: 'Node.js',
      service: 'nodejs',
      dir: resolveBinDir(s.nodejs.binary),
    });
  }
  if (s.python.enabled) {
    addCandidate(candidates, seen, {
      id: 'python:bin',
      label: 'Python',
      service: 'python',
      dir: resolveBinDir(s.python.binary),
    });
  }
  if (s.mongodb.enabled) {
    addCandidate(candidates, seen, {
      id: 'mongodb:bin',
      label: 'MongoDB',
      service: 'mongodb',
      dir: resolveBinDir(s.mongodb.binary),
    });
  }
  if (s.mailpit.enabled) {
    addCandidate(candidates, seen, {
      id: 'mailpit:bin',
      label: 'Mailpit',
      service: 'mailpit',
      dir: resolveBinDir(s.mailpit.binary),
    });
  }
  if (getComposerStatus().installed) {
    addCandidate(candidates, seen, {
      id: 'composer:bin',
      label: 'Composer',
      service: 'composer',
      dir: getComposerDir(),
    });
  }

  return candidates;
}

/** Which candidate IDs are selected for PATH (legacy config migrates to all-or-none). */
export function resolveSelectedPathIds(
  config: DevConfig,
  candidates: EnvPathCandidate[],
): string[] {
  const validIds = new Set(candidates.map((c) => c.id));

  if (Array.isArray(config.general.path_env_selected)) {
    return config.general.path_env_selected.filter((id) => validIds.has(id));
  }

  if (config.general.path_in_env === false) return [];
  return candidates.map((c) => c.id);
}

/** Paths to prepend to user PATH based on current selection. */
export function collectEnvPaths(config: DevConfig): string[] {
  const candidates = listEnvPathCandidates(config);
  const selected = new Set(resolveSelectedPathIds(config, candidates));
  return candidates.filter((c) => selected.has(c.id)).map((c) => c.path);
}
