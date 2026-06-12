import fs from 'fs';
import path from 'path';
import type { Site } from '../config/types';
import { ensureDir, getSitesManifestPath } from '../shared/paths';
import { detectFramework, effectiveHostname, resolveDocRoot, siteHostnameFromDirName } from './sites';

export interface RegisteredSite {
  name: string;
  root: string;
  domain?: string;
  aliases?: string[];
  enabled?: boolean;
  favorite?: boolean;
  /** Override the served document root (absolute, or relative to root). */
  doc_root?: string;
}

/** Custom doc_root override if set + exists, else framework auto-detection. */
function resolveRecordDocRoot(
  record: RegisteredSite,
  root: string,
  framework: Site['framework'],
): string {
  if (record.doc_root && record.doc_root.trim()) {
    const custom = path.isAbsolute(record.doc_root)
      ? record.doc_root
      : path.join(root, record.doc_root);
    if (fs.existsSync(custom)) return path.resolve(custom);
  }
  return resolveDocRoot(root, framework);
}

function safeSiteName(raw: string, fallbackRoot: string): string {
  const trimmed = raw.trim().replace(/[^\w.-]/g, '');
  if (trimmed) return trimmed;
  const base = path.basename(fallbackRoot).replace(/[^\w.-]/g, '');
  return base || 'site';
}

export function loadRegisteredSites(): RegisteredSite[] {
  const file = getSitesManifestPath();
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (s): s is RegisteredSite =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as RegisteredSite).name === 'string' &&
        typeof (s as RegisteredSite).root === 'string',
    );
  } catch {
    return [];
  }
}

export function saveRegisteredSites(sites: RegisteredSite[]): void {
  ensureDir(path.dirname(getSitesManifestPath()));
  fs.writeFileSync(getSitesManifestPath(), JSON.stringify(sites, null, 2), 'utf8');
}

function normalizeAliasList(aliases: unknown): string[] {
  if (!Array.isArray(aliases)) return [];
  const out: string[] = [];
  for (const a of aliases) {
    if (typeof a !== 'string') continue;
    const h = a.trim().toLowerCase();
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

export function registeredToSite(record: RegisteredSite): Site | null {
  const root = path.resolve(record.root);
  if (!fs.existsSync(root)) return null;
  const framework = detectFramework(root);
  return {
    name: record.name,
    hostname: effectiveHostname(record),
    root,
    doc_root: resolveRecordDocRoot(record, root, framework),
    framework,
    enabled: record.enabled !== false,
    favorite: record.favorite === true,
    aliases: normalizeAliasList(record.aliases),
  };
}

export function loadSitesFromRegistry(): Site[] {
  const sites: Site[] = [];
  for (const record of loadRegisteredSites()) {
    const site = registeredToSite(record);
    if (site) sites.push(site);
  }
  return sites.sort((a, b) => {
    const fa = a.favorite ? 1 : 0;
    const fb = b.favorite ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return a.name.localeCompare(b.name);
  });
}

export function addRegisteredSite(name: string, root: string): RegisteredSite {
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${resolved}`);
  }

  const siteName = safeSiteName(name, resolved);
  const sites = loadRegisteredSites();
  if (sites.some((s) => s.name === siteName)) {
    throw new Error(`A site named "${siteName}" is already registered`);
  }

  const hostname = siteHostnameFromDirName(siteName);
  const taken = new Set(sites.flatMap((s) => [effectiveHostname(s), ...(s.aliases ?? [])]));
  if (taken.has(hostname)) {
    throw new Error(`Hostname ${hostname} is already used by another site`);
  }

  const record: RegisteredSite = { name: siteName, root: resolved };
  sites.push(record);
  saveRegisteredSites(sites);
  return record;
}

export function removeRegisteredSite(name: string): void {
  const sites = loadRegisteredSites().filter((s) => s.name !== name);
  if (sites.length === loadRegisteredSites().length) {
    throw new Error(`Site not found: ${name}`);
  }
  saveRegisteredSites(sites);
}

export function validateProjectRoot(sourcePath: string): string {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${resolved}`);
  }
  const framework = detectFramework(resolved);
  if (framework === 'generic' && !fs.existsSync(path.join(resolved, 'public'))) {
    throw new Error('Not a recognized Laravel/WordPress project (needs public/ or artisan)');
  }
  return resolved;
}
