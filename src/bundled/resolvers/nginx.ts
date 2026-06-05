import type { ServiceVersionEntry } from '../types';
import { fetchText } from './http';

export async function resolveNginxVersions(limit = 6): Promise<ServiceVersionEntry[]> {
  const html = await fetchText('https://nginx.org/download/');
  const matches = [...html.matchAll(/nginx-(\d+\.\d+\.\d+)\.zip/gi)];
  const versions = [...new Set(matches.map((m) => m[1]))].sort((a, b) => (a < b ? 1 : -1));

  return versions.slice(0, limit).map((version) => ({
    version,
    label: `nginx ${version} (Windows x64)`,
    url: `https://nginx.org/download/nginx-${version}.zip`,
    sizeBytes: 2_500_000,
    rootFolder: `nginx-${version}`,
  }));
}
