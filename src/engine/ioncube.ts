import fs from 'fs';
import path from 'path';
import { downloadFile } from '../bundled/download';
import { extractZipArchive } from '../bundled/extract-zip';
import { ensureDir, getServicesCacheDir } from '../shared/paths';
import { detectPhpBuild } from './php-build';
import { enableZendExtensionInIni } from './php-extensions';
import { resolvePhpIniPath } from './php-ini';

/** Find a file by name (case-insensitive) anywhere under dir. */
function findFileRecursive(dir: string, name: string): string | null {
  const want = name.toLowerCase();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileRecursive(full, name);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === want) {
      return full;
    }
  }
  return null;
}

/**
 * ionCube Loader — runs PHP encoded with ionCube. It's a zend_extension shipped
 * by ionCube (not PECL), as one zip containing a loader DLL per PHP minor +
 * thread-safety. We download it, copy the matching DLL into the PHP ext dir, and
 * add a `zend_extension=` line to php.ini.
 */
const IONCUBE_URL =
  'https://downloads.ioncube.com/loader_downloads/ioncube_loaders_win_x86-64.zip';

/** Loader DLL name for a PHP build, e.g. ioncube_loader_win_8.3.dll (NTS) / _ts. */
export function ioncubeDllName(majorMinor: string, threadSafe: boolean): string {
  return `ioncube_loader_win_${majorMinor}${threadSafe ? '_ts' : ''}.dll`;
}

export interface IoncubeStatus {
  dllPresent: boolean;
  enabled: boolean;
  dllName: string;
}

export function getIoncubeStatus(phpRoot: string): IoncubeStatus {
  const root = path.resolve(phpRoot);
  let dllName = 'ioncube_loader_win.dll';
  try {
    const build = detectPhpBuild(root);
    dllName = ioncubeDllName(build.majorMinor, build.threadSafe);
  } catch {
    // fall through with placeholder name
  }
  const dllPresent = fs.existsSync(path.join(root, 'ext', dllName));
  let enabled = false;
  try {
    const ini = resolvePhpIniPath(root);
    if (ini && fs.existsSync(ini)) {
      const re = new RegExp(`^\\s*zend_extension\\s*=.*${dllName.replace(/\./g, '\\.')}`, 'im');
      enabled = re.test(fs.readFileSync(ini, 'utf8'));
    }
  } catch {
    // treat as not enabled
  }
  return { dllPresent, enabled, dllName };
}

/** Download the ionCube loaders and enable the one matching this PHP build. */
export async function installIoncube(phpRoot: string): Promise<string> {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  ensureDir(extDir);

  const build = detectPhpBuild(root, { strict: true });
  const dllName = ioncubeDllName(build.majorMinor, build.threadSafe);

  const zipPath = path.join(getServicesCacheDir(), 'ioncube_loaders_win_x86-64.zip');
  await downloadFile(IONCUBE_URL, zipPath);

  const tempDir = path.join(extDir, '_ioncube_extract');
  fs.rmSync(tempDir, { recursive: true, force: true });
  ensureDir(tempDir);
  try {
    extractZipArchive(zipPath, tempDir);
    const found = findFileRecursive(tempDir, dllName);
    if (!found) {
      throw new Error(
        `ionCube has no loader for PHP ${build.majorMinor} (${build.threadSafe ? 'TS' : 'NTS'}, x64).`,
      );
    }
    fs.copyFileSync(found, path.join(extDir, dllName));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  setIoncubeEnabled(root, true);
  return dllName;
}

/** Toggle the ionCube zend_extension line in php.ini (no download). */
export function setIoncubeEnabled(phpRoot: string, enabled: boolean): IoncubeStatus {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  const status = getIoncubeStatus(root);
  if (!status.dllPresent && enabled) {
    throw new Error('ionCube loader is not installed yet.');
  }
  const iniPath = resolvePhpIniPath(root);
  if (!iniPath || !fs.existsSync(iniPath)) throw new Error('php.ini not found');

  let content = fs.readFileSync(iniPath, 'utf8');
  if (enabled) {
    content = enableZendExtensionInIni(content, status.dllName, extDir);
  } else {
    // Comment out any active zend_extension line referencing the loader.
    const re = new RegExp(`^(\\s*)(zend_extension\\s*=.*${status.dllName.replace(/\./g, '\\.')}.*)$`, 'gim');
    content = content.replace(re, '$1;$2');
  }
  fs.writeFileSync(iniPath, content, 'utf8');
  return getIoncubeStatus(root);
}
