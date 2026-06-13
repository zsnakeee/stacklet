import { spawnSync } from 'child_process';
import { BRAND, readEnv } from '../shared/brand';
import fs from 'fs';
import path from 'path';
import { resolvePhpIniPath } from './php-ini';

const MARKER = `; ${BRAND.name} php extensions`;

/** Extensions enabled automatically for phpMyAdmin / Laravel. */
export const PHP_RECOMMENDED_EXTENSIONS = [
  'curl',
  'fileinfo',
  'gd',
  'mbstring',
  'mysqli',
  'openssl',
  'pdo_mysql',
  'pdo_sqlite',
  'sqlite3',
  'zip',
] as const;

export interface PhpExtensionInfo {
  name: string;
  dll: string;
  enabled: boolean;
  recommended: boolean;
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

function joinLines(lines: string[]): string {
  return lines.join('\r\n');
}

export function extensionDllName(name: string): string {
  return `php_${name}.dll`;
}

function dllToExtensionName(dll: string): string | null {
  const m = /^php_(.+)\.dll$/i.exec(dll);
  return m ? m[1] : null;
}

function readIniContent(iniPath: string): string {
  return fs.readFileSync(iniPath, 'utf8');
}

function writeIniContent(iniPath: string, content: string): void {
  fs.writeFileSync(iniPath, content, 'utf8');
}

/** Line written to php.ini when enabling an extension (Windows prefers the .dll name). */
export function extensionEnableLine(name: string): string {
  if (process.platform === 'win32') {
    return `extension=${extensionDllName(name)}`;
  }
  return `extension=${name}`;
}

export function ensureExtensionDirInIni(content: string, extDir: string): string {
  const quoted = `"${extDir.replace(/\\/g, '/')}"`;
  const newLine = `extension_dir = ${quoted}`;
  const keyRe = /^\s*;?\s*extension_dir\s*=/i;
  let replaced = false;
  const out = splitLines(content).map((line) => {
    if (keyRe.test(line)) {
      if (replaced) return `; ${line}`;
      replaced = true;
      return newLine;
    }
    return line;
  });
  if (!replaced) out.push(newLine);
  return joinLines(out);
}

function isExtensionEnabled(content: string, name: string): boolean {
  const dll = extensionDllName(name);
  const patterns = [
    new RegExp(`^\\s*extension\\s*=\\s*${escapeRegExp(name)}\\s*$`, 'm'),
    new RegExp(`^\\s*extension\\s*=\\s*${escapeRegExp(dll)}\\s*$`, 'mi'),
  ];
  return patterns.some((re) => re.test(content));
}

export function enableZendExtensionInIni(
  content: string,
  dllFileName: string,
  extDir: string,
): string {
  const dll = path.join(extDir, dllFileName);
  if (!exists(dll)) return content;

  const line = `zend_extension=${dll.replace(/\\/g, '/')}`;
  const lines = splitLines(content);
  const dllRe = new RegExp(`^\\s*;?\\s*zend_extension\\s*=.*${escapeRegExp(dllFileName)}`, 'i');
  const active = new RegExp(`^\\s*zend_extension\\s*=`, 'i');

  let found = false;
  const out = lines.map((l) => {
    if (dllRe.test(l)) {
      found = true;
      return line;
    }
    return l;
  });

  if (!found) {
    if (!out.some((l) => l === MARKER)) {
      out.push('', MARKER);
    }
    if (!out.some((l) => active.test(l) && l.includes(dllFileName))) {
      out.push(line);
    }
  }

  return joinLines(out);
}

export function enableExtensionInIni(content: string, name: string, extDir: string): string {
  const dllPath = path.join(extDir, extensionDllName(name));
  if (!exists(dllPath)) return content;

  const line = extensionEnableLine(name);
  const dllFile = extensionDllName(name);
  const lines = splitLines(content);
  const commented = new RegExp(`^\\s*;\\s*extension\\s*=\\s*${escapeRegExp(name)}\\s*$`);
  const legacyCommented = new RegExp(`^\\s*;\\s*extension\\s*=\\s*${escapeRegExp(dllFile)}\\s*$`, 'i');
  const activeName = new RegExp(`^\\s*extension\\s*=\\s*${escapeRegExp(name)}\\s*$`);
  const activeDll = new RegExp(`^\\s*extension\\s*=\\s*${escapeRegExp(dllFile)}\\s*$`, 'i');

  let found = false;
  const out = lines.map((l) => {
    if (commented.test(l) || legacyCommented.test(l)) {
      found = true;
      return line;
    }
    if (activeName.test(l) || activeDll.test(l)) {
      found = true;
      return line;
    }
    return l;
  });

  if (!found) {
    if (!out.some((l) => l === MARKER)) {
      out.push('', MARKER);
    }
    if (!out.includes(line)) out.push(line);
  }

  return joinLines(out);
}

/** Keep a single active extension line (fixes "already loaded" warnings). */
export function deduplicateExtensionInIni(content: string, name: string): string {
  const dllFile = extensionDllName(name);
  const line = extensionEnableLine(name);
  const activeRe = new RegExp(
    `^\\s*extension\\s*=\\s*(?:${escapeRegExp(name)}|${escapeRegExp(dllFile)})\\s*$`,
    'i',
  );
  let seen = false;
  const out: string[] = [];
  for (const l of splitLines(content)) {
    if (activeRe.test(l)) {
      if (!seen) {
        seen = true;
        out.push(line);
      }
      continue;
    }
    out.push(l);
  }
  return joinLines(out);
}

export function cleanupPhpIniExtensions(phpRoot: string): void {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  const iniPath = resolvePhpIniPath(root);
  if (!iniPath || !exists(extDir)) return;

  let content = readIniContent(iniPath);
  content = ensureExtensionDirInIni(content, extDir);

  const names = fs
    .readdirSync(extDir)
    .filter((f) => /^php_.*\.dll$/i.test(f))
    .map((dll) => dllToExtensionName(dll))
    .filter((n): n is string => n !== null);

  for (const name of names) {
    content = deduplicateExtensionInIni(content, name);
  }
  writeIniContent(iniPath, content);
}

/** Disable extensions that are listed in php.ini but fail to load (wrong PECL build, etc.). */
export function disableBrokenPhpExtensions(phpRoot: string): void {
  if (process.platform !== 'win32') return;
  for (const ext of listPhpExtensions(phpRoot).filter((e) => e.enabled)) {
    try {
      verifyPhpExtensionLoads(phpRoot, ext.name);
    } catch {
      setPhpExtensionEnabled(phpRoot, ext.name, false, { verify: false });
    }
  }
}

export function disableExtensionInIni(content: string, name: string): string {
  const lines = splitLines(content);
  const dll = extensionDllName(name);
  const active = new RegExp(`^(\\s*)extension\\s*=\\s*${escapeRegExp(name)}\\s*$`);
  const legacyActive = new RegExp(`^(\\s*)extension\\s*=\\s*${escapeRegExp(dll)}\\s*$`, 'i');

  return joinLines(
    lines.map((l) => {
      if (active.test(l) || legacyActive.test(l)) {
        return `;${l.trimStart()}`;
      }
      return l;
    }),
  );
}

export function listPhpExtensions(phpRoot: string): PhpExtensionInfo[] {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  const iniPath = resolvePhpIniPath(root);
  if (!exists(extDir)) return [];

  const iniContent = iniPath && exists(iniPath) ? readIniContent(iniPath) : '';
  const recommended = new Set<string>(PHP_RECOMMENDED_EXTENSIONS);

  const names = fs
    .readdirSync(extDir)
    .filter((f) => /^php_.*\.dll$/i.test(f))
    .map((dll) => dllToExtensionName(dll))
    .filter((n): n is string => n !== null)
    .sort((a, b) => a.localeCompare(b));

  return names.map((name) => ({
    name,
    dll: extensionDllName(name),
    enabled: iniContent ? isExtensionEnabled(iniContent, name) : false,
    recommended: recommended.has(name),
  }));
}

export function setPhpExtensionEnabled(
  phpRoot: string,
  name: string,
  enabled: boolean,
  options?: { verify?: boolean },
): void {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  const dll = path.join(extDir, extensionDllName(name));
  if (!exists(dll)) {
    throw new Error(`Extension not found: ${name}`);
  }

  let iniPath = resolvePhpIniPath(root);
  if (!iniPath) {
    const template = [path.join(root, 'php.ini-development'), path.join(root, 'php.ini-production')].find(
      exists,
    );
    if (!template) throw new Error('php.ini not found');
    iniPath = path.join(root, 'php.ini');
    fs.copyFileSync(template, iniPath);
  }

  let content = readIniContent(iniPath);
  content = ensureExtensionDirInIni(content, extDir);
  if (enabled && name === 'xdebug') {
    content = enableZendExtensionInIni(content, extensionDllName(name), extDir);
  } else {
    content = enabled
      ? enableExtensionInIni(content, name, extDir)
      : disableExtensionInIni(content, name);
  }
  writeIniContent(iniPath, content);

  if (enabled && options?.verify !== false && process.platform === 'win32') {
    verifyPhpExtensionLoads(root, name);
  }
}

/** Confirm php.exe loads the extension with the active php.ini (php-cgi has no -r). */
export function verifyPhpExtensionLoads(phpRoot: string, name: string): void {
  const root = path.resolve(phpRoot);
  const phpExe = path.join(root, 'php.exe');
  const ini = path.join(root, 'php.ini');
  if (!exists(phpExe) || !exists(ini)) return;

  const r = spawnSync(phpExe, ['-c', ini, '-m'], {
    encoding: 'utf8',
    windowsHide: true,
    cwd: root,
    timeout: 15_000,
  });

  const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
  if (/Unable to initialize module/i.test(output) || /need to match/i.test(output)) {
    throw new Error(
      `PHP could not load extension "${name}" (API / build mismatch).${output ? `\n${output}` : ''}\n` +
        `Re-install the extension from PHP → Extensions so ${BRAND.name} downloads the correct PECL zip.`,
    );
  }

  const listed = output
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  if (listed.includes(name.toLowerCase())) return;

  throw new Error(
    `PHP did not load extension "${name}" after enabling it.${output ? `\n${output}` : ''}\n` +
      `Check ext/ and php.ini, then Restart PHP in ${BRAND.name}.`,
  );
}

/** Re-apply ini lines for extensions already marked enabled (fixes extension_dir / .dll form). */
export function normalizeEnabledExtensions(phpRoot: string): void {
  cleanupPhpIniExtensions(phpRoot);
  for (const ext of listPhpExtensions(phpRoot).filter((e) => e.enabled)) {
    setPhpExtensionEnabled(phpRoot, ext.name, true, { verify: false });
  }
  cleanupPhpIniExtensions(phpRoot);
}

export function enableRecommendedExtensions(phpRoot: string): void {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  let iniPath = resolvePhpIniPath(root);
  if (!iniPath) {
    const template = [path.join(root, 'php.ini-development'), path.join(root, 'php.ini-production')].find(
      exists,
    );
    if (!template) throw new Error('php.ini not found');
    iniPath = path.join(root, 'php.ini');
    fs.copyFileSync(template, iniPath);
  }

  let content = readIniContent(iniPath);
  content = ensureExtensionDirInIni(content, extDir);
  for (const ext of PHP_RECOMMENDED_EXTENSIONS) {
    content = enableExtensionInIni(content, ext, extDir);
  }
  for (const ext of PHP_RECOMMENDED_EXTENSIONS) {
    content = deduplicateExtensionInIni(content, ext);
  }
  writeIniContent(iniPath, content);
}
