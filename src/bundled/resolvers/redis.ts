import type { ServiceVersionEntry } from '../types';
import { fetchJson } from './http';

interface GhRelease {
  tag_name: string;
  name: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

export async function resolveRedisVersions(limit = 6): Promise<ServiceVersionEntry[]> {
  const releases = await fetchJson<GhRelease[]>(
    'https://api.github.com/repos/tporadowski/redis/releases?per_page=10',
  );

  const entries: ServiceVersionEntry[] = [];
  for (const rel of releases) {
    const asset = rel.assets.find(
      (a) => a.name.endsWith('.zip') && a.name.includes('x64'),
    );
    if (!asset) continue;
    const version = rel.tag_name.replace(/^v/, '');
    entries.push({
      version,
      label: `Redis ${version} (Windows x64)`,
      url: asset.browser_download_url,
      sizeBytes: asset.size || 12_000_000,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
