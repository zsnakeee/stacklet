import type { SiteDevServerConfig } from '../config/types';
import { findPidListeningOnPort } from './services/mysql';
import type { RegisteredSite } from './sites-registry';

export const DEV_SERVER_PORT_MIN = 5170;
export const DEV_SERVER_PORT_MAX = 5199;

export interface DevServerPatch {
  enabled?: boolean;
  /** Set to null to clear an explicit port and use auto-allocation. */
  port?: number | null;
  /** npm script to run; empty string clears the override (back to "dev"). */
  script?: string;
}

export function validateDevServerPort(
  port: number,
  records: RegisteredSite[],
  selfName: string,
  options?: { skipOsCheck?: boolean },
): void {
  if (!Number.isInteger(port) || port < DEV_SERVER_PORT_MIN || port > DEV_SERVER_PORT_MAX) {
    throw new Error(
      `Dev-server port must be an integer between ${DEV_SERVER_PORT_MIN} and ${DEV_SERVER_PORT_MAX}`,
    );
  }
  for (const r of records) {
    if (r.name === selfName) continue;
    if (r.dev_server?.enabled && r.dev_server.port === port) {
      throw new Error(`Dev-server port ${port} is already used by site "${r.name}"`);
    }
  }
  if (!options?.skipOsCheck) {
    const listener = findPidListeningOnPort(port);
    if (listener) {
      throw new Error(`Port ${port} is already in use by another process (PID ${listener})`);
    }
  }
}

/** Lowest free port in the dev-server range not assigned to another enabled site. */
export function allocateDevServerPort(records: RegisteredSite[], selfName: string): number {
  const taken = new Set<number>();
  for (const r of records) {
    if (r.name === selfName) continue;
    if (r.dev_server?.enabled && r.dev_server.port) taken.add(r.dev_server.port);
  }
  for (let p = DEV_SERVER_PORT_MIN; p <= DEV_SERVER_PORT_MAX; p++) {
    if (!taken.has(p)) return p;
  }
  throw new Error(`No free dev-server port in range ${DEV_SERVER_PORT_MIN}-${DEV_SERVER_PORT_MAX}`);
}

export function effectiveDevServerPort(
  record: RegisteredSite,
  records: RegisteredSite[],
): number | undefined {
  if (!record.dev_server?.enabled) return undefined;
  return record.dev_server.port ?? allocateDevServerPort(records, record.name);
}

/** Resolve the persistable/effective dev-server config for a registered site. */
export function resolveSiteDevServer(
  record: RegisteredSite,
  records: RegisteredSite[],
): SiteDevServerConfig | undefined {
  if (!record.dev_server) return undefined;
  const script = record.dev_server.script?.trim() || undefined;
  if (!record.dev_server.enabled) {
    return { enabled: false, port: record.dev_server.port, script };
  }
  return {
    enabled: true,
    port: effectiveDevServerPort(record, records),
    script,
  };
}

/** Merge a dev-server patch into a registered site (port allocation + validation). */
export function mergeDevServerPatch(
  record: RegisteredSite,
  patch: DevServerPatch,
  records: RegisteredSite[],
): RegisteredSite {
  const next: RegisteredSite = { ...record };
  const current: SiteDevServerConfig = { ...(next.dev_server ?? {}) };

  if (patch.enabled !== undefined) current.enabled = patch.enabled;
  if (patch.script !== undefined) {
    const s = patch.script.trim();
    if (s) current.script = s;
    else delete current.script;
  }
  if (patch.port !== undefined) {
    if (patch.port === null) delete current.port;
    else current.port = patch.port;
  }

  if (!current.enabled) {
    next.dev_server = Object.keys(current).length > 0 ? current : undefined;
    return next;
  }

  const port = current.port ?? allocateDevServerPort(records, record.name);
  const skipOsCheck = current.port === record.dev_server?.port;
  validateDevServerPort(port, records, record.name, { skipOsCheck });
  current.port = port;
  current.enabled = true;
  next.dev_server = current;
  return next;
}
