import type { ServiceVersionEntry } from '../types';
import { fetchJson } from './http';
import { PHPMYADMIN_STATIC_VERSIONS } from './phpmyadmin-static';
import { compareVersions } from './semver';

const VERSION_JSON = 'https://www.phpmyadmin.net/home_page/version.json';
const FILES_BASE = 'https://files.phpmyadmin.net/phpMyAdmin';

interface PhpMyAdminVersionJson {
  version: string;
  releases?: { version: string; date?: string }[];
}

function entryFromVersion(version: string): ServiceVersionEntry {
  return {
    version,
    label: `phpMyAdmin ${version}`,
    url: `${FILES_BASE}/${version}/phpMyAdmin-${version}-all-languages.zip`,
    sizeBytes: 16_000_000,
    rootFolder: `phpMyAdmin-${version}-all-languages`,
  };
}

async function resolvePhpMyAdminDynamic(): Promise<ServiceVersionEntry[]> {
  const data = await fetchJson<PhpMyAdminVersionJson>(VERSION_JSON);
  const versions = new Set<string>();

  if (data.version) versions.add(data.version);
  for (const rel of data.releases ?? []) {
    if (rel.version && rel.version.startsWith('5.')) {
      versions.add(rel.version);
    }
  }

  return [...versions]
    .sort((a, b) => compareVersions(b, a))
    .map(entryFromVersion);
}

function mergeVersions(
  staticList: ServiceVersionEntry[],
  dynamicList: ServiceVersionEntry[],
): ServiceVersionEntry[] {
  const byVersion = new Map<string, ServiceVersionEntry>();
  for (const e of staticList) byVersion.set(e.version, e);
  for (const e of dynamicList) byVersion.set(e.version, e);
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
}

export async function resolvePhpMyAdminVersions(
  _limit?: number,
): Promise<ServiceVersionEntry[]> {
  try {
    const dynamic = await resolvePhpMyAdminDynamic();
    if (dynamic.length > 0) {
      return mergeVersions(PHPMYADMIN_STATIC_VERSIONS, dynamic);
    }
  } catch {
    // static only
  }
  return [...PHPMYADMIN_STATIC_VERSIONS];
}
