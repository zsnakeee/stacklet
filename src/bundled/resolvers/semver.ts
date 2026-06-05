/** Compare semver-like strings (major.minor.patch). */
export function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.').map((p) => Number.parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function gteVersion(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) >= 0;
}
