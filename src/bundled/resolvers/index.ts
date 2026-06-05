import type { BundledServiceId, ServiceCatalogEntry, ServiceVersionEntry } from '../types';
import { SERVICE_META } from '../catalog-meta';
import { resolveMysqlVersions } from './mysql';
import { resolveNginxVersions } from './nginx';
import { resolveNodejsVersions } from './nodejs';
import { NODEJS_STATIC_VERSIONS } from './nodejs-static';
import { resolvePhpVersions } from './php';
import { PHP_STATIC_VERSIONS } from './php-static';
import { resolvePhpMyAdminVersions } from './phpmyadmin';
import { PHPMYADMIN_STATIC_VERSIONS } from './phpmyadmin-static';
import { resolvePostgresVersions } from './postgres';
import { resolveRedisVersions } from './redis';

type ResolverFn = (limit?: number) => Promise<ServiceVersionEntry[]>;

const RESOLVERS: Record<BundledServiceId, ResolverFn> = {
  nginx: resolveNginxVersions,
  php: resolvePhpVersions,
  mysql: resolveMysqlVersions,
  postgres: resolvePostgresVersions,
  nodejs: resolveNodejsVersions,
  redis: resolveRedisVersions,
  phpmyadmin: resolvePhpMyAdminVersions,
};

/** Fallback when upstream APIs are unreachable. */
const FALLBACK: Partial<Record<BundledServiceId, ServiceVersionEntry[]>> = {
  nginx: [
    {
      version: '1.26.2',
      label: 'nginx 1.26.2',
      url: 'https://nginx.org/download/nginx-1.26.2.zip',
      sizeBytes: 2_500_000,
      rootFolder: 'nginx-1.26.2',
    },
  ],
  nodejs: NODEJS_STATIC_VERSIONS,
  phpmyadmin: PHPMYADMIN_STATIC_VERSIONS,
  mysql: [
    {
      version: '10.11.10',
      label: 'MariaDB 10.11.10',
      url: 'https://archive.mariadb.org/mariadb-10.11.10/winx64-packages/mariadb-10.11.10-winx64.zip',
      sizeBytes: 85_000_000,
      rootFolder: 'mariadb-10.11.10-winx64',
    },
  ],
  postgres: [
    {
      version: '17.2',
      label: 'PostgreSQL 17.2',
      url: 'https://get.enterprisedb.com/postgresql/postgresql-17.2-1-windows-x64-binaries.zip',
      sizeBytes: 200_000_000,
      rootFolder: 'pgsql',
    },
  ],
  redis: [
    {
      version: '5.0.14.1',
      label: 'Redis 5.0.14.1',
      url: 'https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip',
      sizeBytes: 12_000_000,
    },
  ],
  php: PHP_STATIC_VERSIONS,
};

export async function resolveServiceVersions(
  id: BundledServiceId,
  limit?: number,
): Promise<ServiceVersionEntry[]> {
  try {
    const versions = await RESOLVERS[id](limit);
    if (versions.length > 0) return versions;
  } catch {
    // fall through
  }
  return FALLBACK[id] ?? [];
}

export async function resolveCatalog(): Promise<ServiceCatalogEntry[]> {
  const entries: ServiceCatalogEntry[] = [];

  for (const meta of SERVICE_META) {
    const versions = await resolveServiceVersions(meta.id);
    entries.push({ ...meta, versions });
  }

  return entries;
}
