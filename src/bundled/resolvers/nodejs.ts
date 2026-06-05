import type { ServiceVersionEntry } from '../types';
import { fetchJson } from './http';
import { NODEJS_STATIC_VERSIONS } from './nodejs-static';
import { compareVersions } from './semver';

const INDEX_URL = 'https://nodejs.org/dist/index.json';
const WIN_VARIANT = 'win-x64-zip';

interface NodeDistEntry {
  version: string;
  date?: string;
  files: string[];
  lts?: boolean | string;
}

function entryFromIndex(item: NodeDistEntry, labelSuffix = ''): ServiceVersionEntry | null {
  if (!item.files?.includes(WIN_VARIANT)) return null;

  const tag = item.version.replace(/^v/, '');
  const ltsLabel = item.lts ? ' (LTS)' : labelSuffix;

  return {
    version: tag,
    label: `Node.js ${tag}${ltsLabel}`,
    url: `https://nodejs.org/dist/${item.version}/node-v${tag}-win-x64.zip`,
    sizeBytes: 35_000_000,
    rootFolder: `node-v${tag}-win-x64`,
  };
}

async function resolveNodejsVersionsDynamic(): Promise<ServiceVersionEntry[]> {
  const index = await fetchJson<NodeDistEntry[]>(INDEX_URL);
  const entries: ServiceVersionEntry[] = [];
  const seen = new Set<string>();

  const push = (item: NodeDistEntry, suffix = ''): void => {
    const entry = entryFromIndex(item, suffix);
    if (!entry || seen.has(entry.version)) return;
    seen.add(entry.version);
    entries.push(entry);
  };

  // Newest release first in index.json
  if (index[0]) {
    push(index[0], index[0].lts ? '' : ' (Current)');
  }

  for (const item of index) {
    if (item.lts) push(item);
  }

  for (const item of index) {
    push(item);
    if (entries.length >= 20) break;
  }

  return entries.sort((a, b) => compareVersions(b.version, a.version));
}

function mergeNodeVersions(
  staticList: ServiceVersionEntry[],
  dynamicList: ServiceVersionEntry[],
): ServiceVersionEntry[] {
  const byVersion = new Map<string, ServiceVersionEntry>();
  for (const e of staticList) byVersion.set(e.version, e);
  for (const e of dynamicList) byVersion.set(e.version, e);
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
}

export async function resolveNodejsVersions(_limit?: number): Promise<ServiceVersionEntry[]> {
  try {
    const dynamic = await resolveNodejsVersionsDynamic();
    if (dynamic.length > 0) {
      return mergeNodeVersions(NODEJS_STATIC_VERSIONS, dynamic);
    }
  } catch {
    // static only
  }
  return [...NODEJS_STATIC_VERSIONS];
}
