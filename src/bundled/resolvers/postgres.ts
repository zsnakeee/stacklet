import type { ServiceVersionEntry } from '../types';
import { fetchJson } from './http';

interface PgVersionRow {
  major: string;
  latest?: { version: string; name: string };
}

export async function resolvePostgresVersions(limit = 5): Promise<ServiceVersionEntry[]> {
  const rows = await fetchJson<PgVersionRow[]>(
    'https://www.postgresql.org/versions.json',
  );

  const entries: ServiceVersionEntry[] = [];
  for (const row of rows) {
    const latest = row.latest?.version;
    if (!latest) continue;
    const full = `${latest}-1`;
    entries.push({
      version: latest,
      label: `PostgreSQL ${row.latest?.name ?? latest}`,
      url: `https://get.enterprisedb.com/postgresql/postgresql-${full}-windows-x64-binaries.zip`,
      sizeBytes: 200_000_000,
      rootFolder: `pgsql`,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
