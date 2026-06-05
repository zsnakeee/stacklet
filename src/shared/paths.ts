import fs from 'fs';
import path from 'path';

/** Base data directory: %LOCALAPPDATA%\\devmgr (or $TMPDIR/devmgr in tests). */
export function getDataDir(): string {
  const base =
    process.env['LOCALAPPDATA'] ??
    process.env['TMPDIR'] ??
    process.env['TMP'] ??
    '/tmp';
  return path.join(base, 'devmgr');
}

export function getCertsDir(): string {
  return path.join(getDataDir(), 'certs');
}

export function getCaCertPath(): string {
  return path.join(getCertsDir(), 'ca.crt');
}

/** Mozilla CA bundle for PHP curl/openssl (HTTPS outbound from PHP apps). */
export function getCaBundlePath(): string {
  return path.join(getCertsDir(), 'cacert.pem');
}

export function getCaKeyPath(): string {
  return path.join(getCertsDir(), 'ca.key');
}

export function getLeafCertPath(): string {
  return path.join(getCertsDir(), 'leaf.crt');
}

export function getLeafKeyPath(): string {
  return path.join(getCertsDir(), 'leaf.key');
}

/** Leaf + CA PEM bundle for nginx ssl_certificate (complete chain). */
export function getFullChainCertPath(): string {
  return path.join(getCertsDir(), 'fullchain.crt');
}

export function getConfigPath(): string {
  return path.join(getDataDir(), 'config.toml');
}

export function getLogsDir(): string {
  return path.join(getDataDir(), 'logs');
}

export function getGeneratedDir(): string {
  return path.join(getDataDir(), 'generated');
}

export function getRuntimeDir(): string {
  return path.join(getDataDir(), 'run');
}

/** Bundled Apache / PHP / MySQL installs */
export function getServicesDir(): string {
  return path.join(getDataDir(), 'services');
}

export function getServicesCacheDir(): string {
  return path.join(getServicesDir(), '.cache');
}

export function getServicesManifestPath(): string {
  return path.join(getServicesDir(), 'manifest.json');
}

export function getSitesManifestPath(): string {
  return path.join(getDataDir(), 'sites.json');
}

/** Default parent folder for new Laravel projects created by dev-mgr. */
export function getProjectsDir(): string {
  return path.join(getDataDir(), 'projects');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureDataLayout(): void {
  for (const dir of [
    getDataDir(),
    getCertsDir(),
    getLogsDir(),
    getGeneratedDir(),
    getRuntimeDir(),
    path.join(getLogsDir(), 'nginx'),
    path.join(getLogsDir(), 'mysql'),
    path.join(getLogsDir(), 'postgres'),
    path.join(getLogsDir(), 'redis'),
    path.join(getLogsDir(), 'sites'),
    getServicesDir(),
    getServicesCacheDir(),
    getProjectsDir(),
  ]) {
    ensureDir(dir);
  }
}
