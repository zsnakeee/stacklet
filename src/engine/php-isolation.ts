import type { Site } from '../config/types';
import { PHP_FASTCGI_PORT } from './service-ports';

/** Isolated (non-default) PHP versions listen on 9001, 9002, … */
const ISOLATED_BASE = PHP_FASTCGI_PORT + 1;

/** Installed versions except the active one, in a stable sorted order. */
function isolatableVersions(active: string, installed: string[]): string[] {
  return installed
    .filter((v) => v && v !== active)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * FastCGI port a site should use: the shared 9000 instance for the active/default
 * version (or an unknown version), and a stable dedicated port for an isolated,
 * installed, non-active version.
 */
export function phpPortForVersion(
  version: string | undefined,
  active: string,
  installed: string[],
): number {
  if (!version || version === active) return PHP_FASTCGI_PORT;
  const idx = isolatableVersions(active, installed).indexOf(version);
  if (idx === -1) return PHP_FASTCGI_PORT;
  return ISOLATED_BASE + idx;
}

/** Distinct isolated versions actually used by enabled sites (installed + non-active). */
export function requiredIsolatedVersions(
  sites: Site[],
  active: string,
  installed: string[],
): string[] {
  const isolatable = new Set(isolatableVersions(active, installed));
  const used = new Set<string>();
  for (const site of sites) {
    if (site.enabled === false) continue;
    const v = site.php_version;
    if (v && v !== active && isolatable.has(v)) used.add(v);
  }
  return [...used];
}
