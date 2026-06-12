import type { ServiceVersionEntry } from '../types';
import { fetchJson } from './http';

interface GhRelease {
  tag_name: string;
  name: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

/** Mailpit ships a single Windows binary inside a per-platform zip on GitHub. */
export async function resolveMailpitVersions(limit = 6): Promise<ServiceVersionEntry[]> {
  const releases = await fetchJson<GhRelease[]>(
    'https://api.github.com/repos/axllent/mailpit/releases?per_page=10',
  );

  const entries: ServiceVersionEntry[] = [];
  for (const rel of releases) {
    const asset = rel.assets.find(
      (a) => a.name.includes('windows') && a.name.includes('amd64') && a.name.endsWith('.zip'),
    );
    if (!asset) continue;
    const version = rel.tag_name.replace(/^v/, '');
    entries.push({
      version,
      label: `Mailpit ${version} (Windows x64)`,
      url: asset.browser_download_url,
      sizeBytes: asset.size || 18_000_000,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}
