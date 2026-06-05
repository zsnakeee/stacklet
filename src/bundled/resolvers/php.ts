import type { ServiceVersionEntry } from '../types';
import { fetchJson } from './http';
import { PHP_STATIC_VERSIONS } from './php-static';
import { compareVersions, gteVersion } from './semver';

const MIN_PHP = '7.4.0';
const RELEASES_JSON = 'https://windows.php.net/downloads/releases/releases.json';
const RELEASES_BASE = 'https://windows.php.net/downloads/releases/';

/** Prefer NTS x64 for nginx/php-fpm; fall back to TS builds. Newest toolchains first. */
const VARIANT_KEYS = [
  'nts-vs17-x64',
  'nts-vs16-x64',
  'nts-vc15-x64',
  'ts-vs17-x64',
  'ts-vs16-x64',
  'ts-vc15-x64',
] as const;

interface PhpZipAsset {
  path: string;
  size?: string;
}

interface PhpVariantBlock {
  zip?: PhpZipAsset;
}

interface PhpMilestoneRelease {
  version: string;
  [key: string]: unknown;
}

function parseSizeBytes(size?: string): number {
  if (!size) return 32_000_000;
  const m = size.match(/^([\d.]+)\s*(MB|GB|KB)/i);
  if (!m) return 32_000_000;
  const n = Number.parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'GB') return Math.round(n * 1024 * 1024 * 1024);
  if (unit === 'MB') return Math.round(n * 1024 * 1024);
  if (unit === 'KB') return Math.round(n * 1024);
  return 32_000_000;
}

function toolchainFromPath(zipPath: string): string {
  if (zipPath.includes('vs17')) return 'VS17';
  if (zipPath.includes('vs16')) return 'VS16';
  if (zipPath.includes('vc15')) return 'VC15';
  return 'x64';
}

function pickVariant(block: PhpMilestoneRelease): PhpVariantBlock | null {
  for (const key of VARIANT_KEYS) {
    const variant = block[key];
    if (
      variant &&
      typeof variant === 'object' &&
      'zip' in variant &&
      (variant as PhpVariantBlock).zip?.path
    ) {
      return variant as PhpVariantBlock;
    }
  }
  return null;
}

function milestoneEntry(block: PhpMilestoneRelease): ServiceVersionEntry | null {
  const version = block.version;
  if (!version || !gteVersion(version, MIN_PHP)) return null;

  const variant = pickVariant(block);
  const zipPath = variant?.zip?.path;
  if (!zipPath) return null;

  const arch = zipPath.includes('nts') ? 'NTS' : 'TS';
  const tc = toolchainFromPath(zipPath);

  return {
    version,
    label: `PHP ${version} (${arch} ${tc} x64)`,
    url: `${RELEASES_BASE}${zipPath}`,
    sizeBytes: parseSizeBytes(variant.zip?.size),
  };
}

async function resolvePhpVersionsDynamic(): Promise<ServiceVersionEntry[]> {
  const raw = await fetchJson<Record<string, PhpMilestoneRelease>>(RELEASES_JSON);

  const milestones = Object.keys(raw)
    .filter((k) => /^\d+\.\d+$/.test(k))
    .sort((a, b) => (a < b ? 1 : -1));

  const entries: ServiceVersionEntry[] = [];
  for (const milestone of milestones) {
    const block = raw[milestone];
    if (!block?.version) continue;

    const entry = milestoneEntry(block);
    if (entry) entries.push(entry);
  }

  return entries;
}

/** Merge dynamic API results over static list (dynamic wins per version). */
function mergePhpVersions(
  staticList: ServiceVersionEntry[],
  dynamicList: ServiceVersionEntry[],
): ServiceVersionEntry[] {
  const byVersion = new Map<string, ServiceVersionEntry>();

  for (const entry of staticList) {
    byVersion.set(entry.version, entry);
  }
  for (const entry of dynamicList) {
    byVersion.set(entry.version, entry);
  }

  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
}

export async function resolvePhpVersions(_limit?: number): Promise<ServiceVersionEntry[]> {
  try {
    const dynamic = await resolvePhpVersionsDynamic();
    if (dynamic.length > 0) {
      return mergePhpVersions(PHP_STATIC_VERSIONS, dynamic);
    }
  } catch {
    // use static only
  }
  return [...PHP_STATIC_VERSIONS];
}
