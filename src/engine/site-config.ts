import { mergeReverbPatch, type ReverbPatch } from './reverb-ports';
import { loadRegisteredSites, saveRegisteredSites, type RegisteredSite } from './sites-registry';
import { effectiveHostname } from './sites';

export interface SitePatch {
  domain?: string | null;
  aliases?: string[];
  enabled?: boolean;
  favorite?: boolean;
  reverb?: ReverbPatch;
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
export function mergeSitePatch(
  record: RegisteredSite,
  patch: SitePatch,
  allRecords?: RegisteredSite[],
): RegisteredSite {
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
  if (patch.reverb !== undefined) {
    const records = allRecords ?? [record];
    return mergeReverbPatch(next, patch.reverb, records);
  }
  return next;
}

/** Load, patch, validate uniqueness, and persist a single site. */
export function updateRegisteredSite(name: string, patch: SitePatch): RegisteredSite {
  const records = loadRegisteredSites();
  const idx = records.findIndex((r) => r.name === name);
  if (idx === -1) throw new Error(`Site not found: ${name}`);
  const updated = mergeSitePatch(records[idx], patch, records);
  assertHostnamesAvailable(records, name, recordHostnames(updated));
  records[idx] = updated;
  saveRegisteredSites(records);
  return updated;
}
