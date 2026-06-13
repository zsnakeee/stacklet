import type { SiteReverbConfig } from '../config/types';
import { findPidListeningOnPort } from './services/mysql';
import type { RegisteredSite } from './sites-registry';

export const REVERB_PORT_MIN = 8080;
export const REVERB_PORT_MAX = 8099;

export interface ReverbPatch {
  enabled?: boolean;
  /** Set to null to clear an explicit port and use auto-allocation. */
  port?: number | null;
}

export function validateReverbPort(
  port: number,
  records: RegisteredSite[],
  selfName: string,
  options?: { skipOsCheck?: boolean },
): void {
  if (!Number.isInteger(port) || port < REVERB_PORT_MIN || port > REVERB_PORT_MAX) {
    throw new Error(
      `Reverb port must be an integer between ${REVERB_PORT_MIN} and ${REVERB_PORT_MAX}`,
    );
  }
  for (const r of records) {
    if (r.name === selfName) continue;
    if (r.reverb?.enabled && r.reverb.port === port) {
      throw new Error(`Reverb port ${port} is already used by site "${r.name}"`);
    }
  }
  if (!options?.skipOsCheck) {
    const listener = findPidListeningOnPort(port);
    if (listener) {
      throw new Error(`Port ${port} is already in use by another process (PID ${listener})`);
    }
  }
}

/** Lowest free port in the Reverb range not assigned to another enabled site. */
export function allocateReverbPort(records: RegisteredSite[], selfName: string): number {
  const taken = new Set<number>();
  for (const r of records) {
    if (r.name === selfName) continue;
    if (r.reverb?.enabled && r.reverb.port) taken.add(r.reverb.port);
  }
  for (let p = REVERB_PORT_MIN; p <= REVERB_PORT_MAX; p++) {
    if (!taken.has(p)) return p;
  }
  throw new Error(`No free Reverb port in range ${REVERB_PORT_MIN}-${REVERB_PORT_MAX}`);
}

export function effectiveReverbPort(
  record: RegisteredSite,
  records: RegisteredSite[],
): number | undefined {
  if (!record.reverb?.enabled) return undefined;
  return record.reverb.port ?? allocateReverbPort(records, record.name);
}

export function resolveSiteReverb(
  record: RegisteredSite,
  records: RegisteredSite[],
): SiteReverbConfig | undefined {
  if (!record.reverb) return undefined;
  if (!record.reverb.enabled) {
    return record.reverb.port ? { enabled: false, port: record.reverb.port } : { enabled: false };
  }
  return { enabled: true, port: effectiveReverbPort(record, records) };
}

/** Merge reverb patch and persistable record fields (port allocation + validation). */
export function mergeReverbPatch(
  record: RegisteredSite,
  patch: ReverbPatch,
  records: RegisteredSite[],
): RegisteredSite {
  const next: RegisteredSite = { ...record };
  const current = { ...(next.reverb ?? {}) };

  if (patch.enabled !== undefined) {
    current.enabled = patch.enabled;
  }
  if (patch.port !== undefined) {
    if (patch.port === null) {
      delete current.port;
    } else {
      current.port = patch.port;
    }
  }

  if (!current.enabled) {
    next.reverb = Object.keys(current).length > 0 ? current : undefined;
    return next;
  }

  const port = current.port ?? allocateReverbPort(records, record.name);
  const skipOsCheck = current.port === record.reverb?.port;
  validateReverbPort(port, records, record.name, { skipOsCheck });
  current.port = port;
  current.enabled = true;
  next.reverb = current;
  return next;
}
