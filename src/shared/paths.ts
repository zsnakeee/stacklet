import fs from 'fs';
import path from 'path';
import { BRAND, readEnv } from './brand';

const DATA_DIR_NAME = BRAND.dataDirName;
const LEGACY_DATA_DIR_NAME = BRAND.legacyDataDirName;

// undefined = not yet checked, null = no override, string = custom data dir.
let cachedOverride: string | null | undefined;

function baseDir(): string {
  return (
    process.env['LOCALAPPDATA'] ?? process.env['TMPDIR'] ?? process.env['TMP'] ?? '/tmp'
  );
}

/** Fixed pointer file (outside the data dir) holding a custom data-dir path. */
function overridePointerPath(): string {
  return path.join(baseDir(), `${BRAND.slug}.datadir`);
}

/** Resolve a custom data-dir override (env or pointer file) once; cache the result. */
function resolveOverride(): string | null {
  if (cachedOverride !== undefined) return cachedOverride;
  const env = readEnv('DATA_DIR');
  if (env && env.trim()) {
    cachedOverride = path.resolve(env.trim());
    return cachedOverride;
  }
  try {
    const ptr = overridePointerPath();
    if (fs.existsSync(ptr)) {
      const stored = fs.readFileSync(ptr, 'utf8').trim();
      if (stored) {
        cachedOverride = path.resolve(stored);
        return cachedOverride;
      }
    }
  } catch {
    // fall through
  }
  cachedOverride = null;
  return null;
}

/** Base data directory: a custom override, else %LOCALAPPDATA%\stacklet. */
export function getDataDir(): string {
  return resolveOverride() ?? path.join(baseDir(), DATA_DIR_NAME);
}

/** Persist a custom data-dir location (pointer file); re-resolved on next call. */
export function setDataDirOverride(dir: string | null): void {
  const ptr = overridePointerPath();
  if (!dir) {
    if (fs.existsSync(ptr)) fs.rmSync(ptr);
  } else {
    fs.mkdirSync(path.dirname(ptr), { recursive: true });
    fs.writeFileSync(ptr, path.resolve(dir), 'utf8');
  }
  cachedOverride = undefined;
}

/**
 * One-time migration of the legacy %LOCALAPPDATA%\devmgr folder to \stacklet.
 * Must run BEFORE anything creates the new data dir. Best-effort (no throw).
 */
export function migrateLegacyDataDir(): void {
  try {
    if (readEnv('DATA_DIR')) return;
    if (fs.existsSync(overridePointerPath())) return;
    const next = path.join(baseDir(), DATA_DIR_NAME);
    const legacy = path.join(baseDir(), LEGACY_DATA_DIR_NAME);
    if (!fs.existsSync(next) && fs.existsSync(legacy)) {
      fs.renameSync(legacy, next);
    }
  } catch {
    // best-effort; default dir will be created fresh if migration fails
  }
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

let projectsDirOverride: string | null = null;

/** Set a custom projects folder (from config); null reverts to the default. */
export function setProjectsDirOverride(dir: string | null): void {
  projectsDirOverride = dir && dir.trim() ? path.resolve(dir.trim()) : null;
}

/** Parent folder for new projects: custom override, else <data>\projects. */
export function getProjectsDir(): string {
  return projectsDirOverride ?? path.join(getDataDir(), 'projects');
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
