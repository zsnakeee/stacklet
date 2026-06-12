import { loadRegisteredSites, saveRegisteredSites, type RegisteredSite } from './sites-registry';
import { effectiveHostname } from './sites';

export interface SitePatch {
  domain?: string | null;
  aliases?: string[];
  enabled?: boolean;
  favorite?: boolean;
  /** Document root override; null/empty clears it (back to auto-detect). */
  doc_root?: string | null;
  /** Isolated PHP version; null/empty clears it (back to default). */
  php_version?: string | null;
}

const LABEL = '[a-z0-9]([a-z0-9-]*[a-z0-9])?';
const HOSTNAME_RE = new RegExp(`^${LABEL}(\\.${LABEL})*$`);

export function normalizeHostname(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateHostname(raw: string): string {
  const h = normalizeHostname(raw);
  if (!h) throw new Error('Hostname cannot be empty');
  if (h.length > 253) throw new Error(`Hostname too long: ${raw}`);
  if (!HOSTNAME_RE.test(h)) throw new Error(`Invalid hostname: ${raw}`);
  return h;
}

export function normalizeAliases(aliases?: string[]): string[] {
  if (!aliases) return [];
  const out: string[] = [];
  for (const a of aliases) {
    const h = normalizeHostname(a);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

/** Primary hostname plus all aliases for a record. */
export function recordHostnames(record: RegisteredSite): string[] {
  return [effectiveHostname(record), ...normalizeAliases(record.aliases)];
}

/** Throw if any candidate hostname already belongs to a different site. */
export function assertHostnamesAvailable(
  records: RegisteredSite[],
  selfName: string,
  candidate: string[],
): void {
  const taken = new Map<string, string>();
  for (const r of records) {
    if (r.name === selfName) continue;
    for (const h of recordHostnames(r)) taken.set(h, r.name);
  }
  for (const h of candidate) {
    const owner = taken.get(h);
    if (owner) throw new Error(`Hostname ${h} is already used by site "${owner}"`);
  }
}

/** Pure merge of a patch into a record, validating hostnames. */
export function mergeSitePatch(record: RegisteredSite, patch: SitePatch): RegisteredSite {
  const next: RegisteredSite = { ...record };
  if (patch.domain !== undefined) {
    if (patch.domain === null || patch.domain.trim() === '') {
      delete next.domain;
    } else {
      next.domain = validateHostname(patch.domain);
    }
  }
  if (patch.aliases !== undefined) {
    const norm = normalizeAliases(patch.aliases);
    norm.forEach((a) => validateHostname(a));
    next.aliases = norm;
  }
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.favorite !== undefined) next.favorite = patch.favorite;
  if (patch.doc_root !== undefined) {
    if (patch.doc_root === null || patch.doc_root.trim() === '') {
      delete next.doc_root;
    } else {
      next.doc_root = patch.doc_root.trim();
    }
  }
  if (patch.php_version !== undefined) {
    if (patch.php_version === null || patch.php_version.trim() === '') {
      delete next.php_version;
    } else {
      next.php_version = patch.php_version.trim();
    }
  }
  return next;
}

/** Load, patch, validate uniqueness, and persist a single site. */
export function updateRegisteredSite(name: string, patch: SitePatch): RegisteredSite {
  const records = loadRegisteredSites();
  const idx = records.findIndex((r) => r.name === name);
  if (idx === -1) throw new Error(`Site not found: ${name}`);
  const updated = mergeSitePatch(records[idx], patch);
  assertHostnamesAvailable(records, name, recordHostnames(updated));
  records[idx] = updated;
  saveRegisteredSites(records);
  return updated;
}
