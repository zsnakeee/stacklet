import fs from 'fs';
import path from 'path';
import type { ServiceCatalogEntry } from './types';
import { ensureDir, getServicesDir } from '../shared/paths';

const CACHE_FILE = 'catalog-cache.json';
const TTL_MS = 6 * 60 * 60 * 1000;

interface CatalogCacheFile {
  fetchedAt: string;
  entries: ServiceCatalogEntry[];
}

function cachePath(): string {
  return path.join(getServicesDir(), CACHE_FILE);
}

export function readCatalogCache(): ServiceCatalogEntry[] | null {
  const file = cachePath();
  if (!fs.existsSync(file)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as CatalogCacheFile;
    const age = Date.now() - new Date(data.fetchedAt).getTime();
    if (age > TTL_MS) return null;
    return data.entries;
  } catch {
    return null;
  }
}

export function writeCatalogCache(entries: ServiceCatalogEntry[]): void {
  ensureDir(getServicesDir());
  const payload: CatalogCacheFile = {
    fetchedAt: new Date().toISOString(),
    entries,
  };
  fs.writeFileSync(cachePath(), JSON.stringify(payload, null, 2), 'utf8');
}

export function clearCatalogCache(): void {
  const file = cachePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
