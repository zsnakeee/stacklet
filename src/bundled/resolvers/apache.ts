import type { ServiceVersionEntry } from '../types';

/**
 * Apache httpd Windows builds (Apache Lounge — the de-facto Windows distributor;
 * apache.org doesn't ship Windows binaries). URLs are date-stamped and can rot
 * over time; pin known-good builds. The zip extracts to an `Apache24` folder.
 */
const APACHE_VERSIONS: ServiceVersionEntry[] = [
  {
    version: '2.4.62',
    label: 'Apache httpd 2.4.62 (Windows x64, VS17)',
    url: 'https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.62-240904-win64-VS17.zip',
    sizeBytes: 18_000_000,
    rootFolder: 'Apache24',
  },
];

export async function resolveApacheVersions(limit = 6): Promise<ServiceVersionEntry[]> {
  return APACHE_VERSIONS.slice(0, limit);
}
