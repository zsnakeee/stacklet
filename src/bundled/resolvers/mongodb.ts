import type { ServiceVersionEntry } from '../types';

/**
 * MongoDB Community Server Windows builds. Static list — the official download
 * feed (downloads.mongodb.org/full.json) is large/nested; pinning known-good
 * zips is more reliable. The zip extracts to a single top-level folder that the
 * installer auto-detects (no rootFolder hint needed).
 */
const MONGODB_VERSIONS: ServiceVersionEntry[] = [
  {
    version: '7.0.14',
    label: 'MongoDB 7.0.14 (Windows x64)',
    url: 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14.zip',
    sizeBytes: 350_000_000,
  },
  {
    version: '6.0.17',
    label: 'MongoDB 6.0.17 (Windows x64)',
    url: 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-6.0.17.zip',
    sizeBytes: 320_000_000,
  },
];

export async function resolveMongodbVersions(limit = 6): Promise<ServiceVersionEntry[]> {
  return MONGODB_VERSIONS.slice(0, limit);
}
