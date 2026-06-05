import type { LogSource } from './sources';

const PREFERRED_SUFFIXES = ['error', 'access'] as const;

/** Pick the best log id for a bundled service (never falls back to unrelated site logs). */
export function resolveServiceLogId(
  bundledId: string,
  sources: LogSource[],
  phpVersion: string,
): string | null {
  let candidates: LogSource[] = [];

  switch (bundledId) {
    case 'nginx':
      candidates = sources.filter((s) => s.kind === 'nginx');
      break;
    case 'php':
      candidates = sources.filter(
        (s) => s.kind === 'php' && s.id.startsWith(`php:${phpVersion}:`),
      );
      break;
    case 'mysql':
      candidates = sources.filter((s) => s.kind === 'mysql');
      break;
    case 'postgres':
      candidates = sources.filter((s) => s.kind === 'postgres');
      break;
    case 'redis':
      candidates = sources.filter((s) => s.kind === 'redis');
      break;
    default:
      return null;
  }

  if (candidates.length === 0) return null;

  for (const suffix of PREFERRED_SUFFIXES) {
    const hit = candidates.find((s) => s.id.endsWith(`:${suffix}`));
    if (hit) return hit.id;
  }

  return candidates[0]?.id ?? null;
}
