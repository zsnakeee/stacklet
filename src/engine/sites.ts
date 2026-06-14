import fs from 'fs';
import path from 'path';
import type { Site } from '../config/types';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'vendor',
  '.idea',
  '.vscode',
]);

/** Windows profile folders that are not web projects when Documents is parked by mistake. */
const SKIP_PARK_FOLDER_NAMES = new Set([
  'My Music',
  'My Pictures',
  'My Videos',
  'Downloads',
  'OneNote Notebooks',
  'Custom Office Templates',
  'IISExpress',
  'SQL Server Management Studio',
  'Visual Studio 2017',
  'Visual Studio 2019',
  'Visual Studio 2022',
  'WindowsPowerShell',
]);

/**
 * Configurable site TLD (default "test"). Set from config by the orchestrator
 * so the pure hostname helpers below don't need the whole config threaded in.
 */
let currentTld = 'test';
export function setSiteTld(tld: string): void {
  const clean = (tld || '').trim().toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9.-]/g, '');
  currentTld = clean || 'test';
}
export function getSiteTld(): string {
  return currentTld;
}

/** DNS-safe *.<tld> hostname from a park folder name (spaces → hyphens). */
export function siteHostnameFromDirName(dirName: string): string {
  const slug = dirName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'site'}.${currentTld}`;
}

/** Primary hostname for a site: custom domain override, else derived from name. */
export function effectiveHostname(record: { name: string; domain?: string }): string {
  const custom = record.domain?.trim().toLowerCase();
  if (custom) return custom;
  return siteHostnameFromDirName(record.name);
}

const exists = (root: string, ...names: string[]): boolean =>
  names.some((n) => fs.existsSync(path.join(root, n)));

export function detectFramework(root: string): Site['framework'] {
  // PHP frameworks first (a Laravel app also has package.json).
  if (fs.existsSync(path.join(root, 'artisan'))) return 'laravel';
  if (fs.existsSync(path.join(root, 'wp-config.php'))) return 'wordpress';
  // Node-based projects (served by proxying their dev server).
  if (fs.existsSync(path.join(root, 'package.json'))) {
    if (exists(root, 'next.config.js', 'next.config.ts', 'next.config.mjs')) return 'nextjs';
    if (exists(root, 'vite.config.js', 'vite.config.ts', 'vite.config.mjs')) return 'vite';
    return 'node';
  }
  return 'generic';
}

export function resolveDocRoot(root: string, framework: Site['framework']): string {
  if (framework === 'laravel' || framework === 'wordpress') {
    const publicDir = path.join(root, 'public');
    if (fs.existsSync(publicDir)) return publicDir;
  }
  return root;
}

export function discoverSites(parkPath: string): Site[] {
  if (!parkPath || !fs.existsSync(parkPath)) return [];

  const entries = fs.readdirSync(parkPath, { withFileTypes: true });
  const sites: Site[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    if (SKIP_PARK_FOLDER_NAMES.has(entry.name)) continue;

    const root = path.join(parkPath, entry.name);
    const framework = detectFramework(root);
    sites.push({
      name: entry.name,
      hostname: siteHostnameFromDirName(entry.name),
      root,
      doc_root: resolveDocRoot(root, framework),
      framework,
    });
  }

  return sites.sort((a, b) => a.name.localeCompare(b.name));
}

export function findLaravelLogPaths(site: Site): string[] {
  if (site.framework !== 'laravel') return [];
  const logsDir = path.join(site.root, 'storage', 'logs');
  if (!fs.existsSync(logsDir)) return [];

  return fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith('laravel') && f.endsWith('.log'))
    .map((f) => path.join(logsDir, f));
}
