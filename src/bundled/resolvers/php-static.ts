import type { ServiceVersionEntry } from '../types';

const BASE = 'https://windows.php.net/downloads/releases/';

/**
 * Curated PHP builds (NTS x64) — one latest patch per minor line, 7.4 → 8.5.
 * Used as baseline; dynamic resolver refreshes patch numbers from releases.json.
 */
export const PHP_STATIC_VERSIONS: ServiceVersionEntry[] = [
  {
    version: '8.5.6',
    label: 'PHP 8.5.6 (NTS VS17 x64)',
    url: `${BASE}php-8.5.6-nts-Win32-vs17-x64.zip`,
    sizeBytes: 34_000_000,
  },
  {
    version: '8.4.21',
    label: 'PHP 8.4.21 (NTS VS17 x64)',
    url: `${BASE}php-8.4.21-nts-Win32-vs17-x64.zip`,
    sizeBytes: 33_000_000,
  },
  {
    version: '8.3.31',
    label: 'PHP 8.3.31 (NTS VS16 x64)',
    url: `${BASE}php-8.3.31-nts-Win32-vs16-x64.zip`,
    sizeBytes: 32_000_000,
  },
  {
    version: '8.2.31',
    label: 'PHP 8.2.31 (NTS VS16 x64)',
    url: `${BASE}php-8.2.31-nts-Win32-vs16-x64.zip`,
    sizeBytes: 32_000_000,
  },
  {
    version: '8.1.34',
    label: 'PHP 8.1.34 (NTS VS16 x64)',
    url: `${BASE}php-8.1.34-nts-Win32-vs16-x64.zip`,
    sizeBytes: 31_000_000,
  },
  {
    version: '8.0.30',
    label: 'PHP 8.0.30 (NTS VS16 x64)',
    url: `${BASE}php-8.0.30-nts-Win32-vs16-x64.zip`,
    sizeBytes: 30_000_000,
  },
  {
    version: '7.4.33',
    label: 'PHP 7.4.33 (NTS VC15 x64)',
    url: `${BASE}php-7.4.33-nts-Win32-vc15-x64.zip`,
    sizeBytes: 26_000_000,
  },
];
