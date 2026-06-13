import { readCatalogCache, writeCatalogCache } from './catalog-cache';
import { resolveCatalog } from './resolvers';
import { SERVICE_META } from './catalog-meta';
import type { BundledServiceId, ServiceCatalogEntry, ServiceVersionEntry } from './types';

let memoryCatalog: ServiceCatalogEntry[] | null = null;

export { SERVICE_META };

export async function getCatalog(forceRefresh = false): Promise<ServiceCatalogEntry[]> {
  if (!forceRefresh && memoryCatalog) {
    return memoryCatalog;
  }

  if (!forceRefresh) {
    const cached = readCatalogCache();
    if (cached) {
      const phpEmpty = cached.find((e) => e.id === 'php')?.versions.length === 0;
      // Bypass a stale cache that predates a newly-added service (e.g. Apache,
      // Mailpit, MongoDB, Python) so the catalog always reflects SERVICE_META.
      const missingService = SERVICE_META.some((m) => !cached.some((e) => e.id === m.id));
      if (!phpEmpty && !missingService) {
        memoryCatalog = cached;
        return cached;
      }
    }
  }

  const catalog = await resolveCatalog();
  memoryCatalog = catalog;
  writeCatalogCache(catalog);
  return catalog;
}

export function invalidateCatalog(): void {
  memoryCatalog = null;
}

export async function getCatalogEntry(id: BundledServiceId): Promise<ServiceCatalogEntry> {
  const catalog = await getCatalog();
  const entry = catalog.find((s) => s.id === id);
  if (!entry) {
    const meta = SERVICE_META.find((m) => m.id === id);
    if (!meta) throw new Error(`unknown service: ${id}`);
    return { ...meta, versions: [] };
  }
  return entry;
}

export async function resolveVersionEntry(
  id: BundledServiceId,
  version: string,
): Promise<ServiceVersionEntry> {
  const entry = await getCatalogEntry(id);
  const ver = entry.versions.find((v) => v.version === version);
  if (!ver) {
    throw new Error(`${id}: version ${version} is not available (refresh catalog)`);
  }
  return ver;
}

/** Versions newer than the installed one (for Update). */
export async function listNewerVersions(
  id: BundledServiceId,
  installedVersion: string,
): Promise<ServiceVersionEntry[]> {
  const entry = await getCatalogEntry(id);
  const { compareVersions } = await import('./resolvers/semver');
  return entry.versions.filter((v) => compareVersions(v.version, installedVersion) > 0);
}
