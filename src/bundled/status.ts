import type { ServiceStatus } from '../engine/services/process';
import { getCatalog } from './catalog';
import { compareVersions } from './resolvers/semver';
import { getInstalledRecord, isInstalled } from './registry';
import type { BundledServiceId, BundledServiceStatus } from './types';

const RUNTIME_MAP: Record<string, string> = {
  nginx: 'nginx',
  php: 'php-fpm',
  mysql: 'mysql',
  postgres: 'postgres',
  redis: 'redis',
  nodejs: 'nodejs',
};

const NO_RUNTIME = new Set<BundledServiceId>(['nodejs', 'phpmyadmin']);

function resolveRuntimeState(
  entryId: BundledServiceId,
  installed: boolean,
  runtime: ServiceStatus | undefined,
): BundledServiceStatus['runtimeState'] {
  if (NO_RUNTIME.has(entryId)) {
    return installed ? 'n/a' : 'stopped';
  }
  if (!installed) return 'stopped';
  if (runtime?.state === 'running') return 'running';
  if (runtime?.state === 'error') return 'error';
  return 'stopped';
}

/** Refresh running/stopped state without reloading the service catalog. */
export function applyRuntimeToBundledStatus(
  entries: BundledServiceStatus[],
  runtimeStatuses: ServiceStatus[],
): BundledServiceStatus[] {
  return entries.map((entry) => {
    const runtimeName = RUNTIME_MAP[entry.id];
    const runtime = runtimeStatuses.find((s) => s.name === runtimeName);
    const runtimeState = resolveRuntimeState(entry.id, entry.installed, runtime);
    return {
      ...entry,
      runtimeState,
      runtimeMessage: runtime?.message,
      pid: runtime?.pid,
    };
  });
}

export async function buildBundledStatus(
  runtimeStatuses: ServiceStatus[],
): Promise<BundledServiceStatus[]> {
  const catalog = await getCatalog();

  return catalog.map((entry) => {
    const installed = isInstalled(entry.id);
    const record = getInstalledRecord(entry.id);
    const runtimeName = RUNTIME_MAP[entry.id];
    const runtime = runtimeStatuses.find((s) => s.name === runtimeName);
    const latest = entry.versions[0]?.version ?? null;

    const runtimeState = resolveRuntimeState(entry.id, installed, runtime);

    const hasUpdate =
      installed &&
      !!record?.version &&
      !!latest &&
      compareVersions(latest, record.version) > 0;

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      installed,
      installedVersion: record?.version ?? null,
      installPath: record?.path ?? null,
      hasUpdate,
      latestVersion: latest,
      runtimeState,
      runtimeMessage: runtime?.message,
      pid: runtime?.pid,
      versions: entry.versions,
    };
  });
}
