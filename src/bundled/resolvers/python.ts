import type { ServiceVersionEntry } from '../types';

/**
 * Python Windows "embeddable" zips — a self-contained python.exe with no
 * installer, ideal for a portable per-machine interpreter. Files extract to the
 * zip root (python.exe at top level).
 */
const PYTHON_VERSIONS: ServiceVersionEntry[] = [
  {
    version: '3.12.7',
    label: 'Python 3.12.7 (embeddable x64)',
    url: 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip',
    sizeBytes: 11_000_000,
  },
  {
    version: '3.11.9',
    label: 'Python 3.11.9 (embeddable x64)',
    url: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip',
    sizeBytes: 11_000_000,
  },
];

export async function resolvePythonVersions(limit = 6): Promise<ServiceVersionEntry[]> {
  return PYTHON_VERSIONS.slice(0, limit);
}
