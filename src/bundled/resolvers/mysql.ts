import type { ServiceVersionEntry } from '../types';
import { fetchJson } from './http';

interface MariaDbRelease {
  release_id: string;
  release_name: string;
}

export async function resolveMysqlVersions(limit = 6): Promise<ServiceVersionEntry[]> {
  const data = await fetchJson<MariaDbRelease[]>(
    'https://downloads.mariadb.org/rest-api/mariadb/?os=Windows&cpu=x64&limit=10',
  );

  const entries: ServiceVersionEntry[] = [];
  for (const rel of data) {
    const version = rel.release_id;
    const folder = `mariadb-${version}-winx64`;
    entries.push({
      version,
      label: `MariaDB ${rel.release_name || version}`,
      url: `https://archive.mariadb.org/mariadb-${version}/winx64-packages/${folder}.zip`,
      sizeBytes: 85_000_000,
      rootFolder: folder,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
