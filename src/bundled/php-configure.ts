import fs from 'fs';
import path from 'path';
import {
  enableExtensionInIni,
  enableRecommendedExtensions,
  enableZendExtensionInIni,
  PHP_RECOMMENDED_EXTENSIONS,
} from '../engine/php-extensions';
import { isValidCaBundle } from '../engine/php-ca-bundle';
import { BRAND } from '../shared/brand';
import { ensureDir, getDataDir } from '../shared/paths';

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

function joinLines(lines: string[]): string {
  return lines.join('\r\n');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function setIniDirective(content: string, key: string, value: string): string {
  const lines = splitLines(content);
  const keyRe = new RegExp(`^\\s*;?\\s*${escapeRegExp(key)}\\s*=`);
  const newLine = `${key} = "${value.replace(/\\/g, '/')}"`;
  let replaced = false;

  const out = lines.map((line) => {
    if (/extension-dir\s*extension_dir/i.test(line)) {
      if (replaced) return `; ${line}`;
      replaced = true;
      return newLine;
    }
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

function setIniDirectiveUnquoted(content: string, key: string, value: string): string {
  const lines = splitLines(content);
  const keyRe = new RegExp(`^\\s*;?\\s*${escapeRegExp(key)}\\s*=`);
  const newLine = `${key} = ${value}`;
  let replaced = false;

  const out = lines.map((line) => {
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

/** Per-version OPcache file cache directory (Windows ASLR / built-in OPcache on php-cgi). */
export function opcacheFileCacheDirForPhpRoot(phpRoot: string): string {
  const cacheKey = path.basename(path.resolve(phpRoot)).replace(/[^a-zA-Z0-9._-]+/g, '-');
  const fileCacheDir = path.join(getDataDir(), 'opcache', 'file-cache', cacheKey);
  ensureDir(fileCacheDir);
  return fileCacheDir;
}

export function opcacheCacheIdForPhpRoot(phpRoot: string): string {
  const cacheKey = path.basename(path.resolve(phpRoot)).replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${BRAND.slug}-cgi-${cacheKey}`;
}

/** Windows php-cgi: OPcache SHM + ASLR needs file cache (avoids fatal on startup). */
function configureOpcacheForWindows(content: string, phpRoot: string, extDir: string): string {
  const fileCacheDir = opcacheFileCacheDirForPhpRoot(phpRoot);
  const cacheId = opcacheCacheIdForPhpRoot(phpRoot);

  let next = content;
  const opcacheDll = path.join(extDir, 'php_opcache.dll');
  if (exists(opcacheDll)) {
    next = enableZendExtensionInIni(next, 'php_opcache.dll', extDir);
  }

  next = setIniDirective(next, 'opcache.file_cache', fileCacheDir);
  next = setIniDirectiveUnquoted(next, 'opcache.file_cache_fallback', '1');
  next = setIniDirectiveUnquoted(next, 'opcache.cache_id', cacheId);
  return next;
}

function clearIniDirective(content: string, key: string): string {
  const lines = splitLines(content);
  const keyRe = new RegExp(`^\\s*;?\\s*${escapeRegExp(key)}\\s*=`);
  return joinLines(
    lines.map((line) => {
      if (keyRe.test(line) && !/^\s*;/.test(line)) {
        return `; ${line.trimStart()}`;
      }
      return line;
    }),
  );
}

export type EnsurePhpIniOptions = {
  /** Path to cacert.pem for curl.cainfo / openssl.cafile (fixes HTTPS from PHP). */
  caBundlePath?: string;
};

/**
 * Ensure php.ini exists under the PHP install root and enable common extensions.
 * Returns the path to php.ini, or null if PHP root is invalid.
 */
export function ensurePhpIni(phpRoot: string, options?: EnsurePhpIniOptions): string | null {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  if (!exists(path.join(root, 'php.exe')) || !exists(extDir)) return null;

  const iniPath = path.join(root, 'php.ini');
  if (!exists(iniPath)) {
    const template = [path.join(root, 'php.ini-development'), path.join(root, 'php.ini-production')].find(
      exists,
    );
    if (!template) return null;
    fs.copyFileSync(template, iniPath);
  }

  let content = fs.readFileSync(iniPath, 'utf8');
  content = setIniDirective(content, 'extension_dir', extDir);
  content = setIniDirective(content, 'display_errors', 'Off');
  content = setIniDirective(content, 'log_errors', 'On');
  content = setIniDirective(content, 'error_reporting', 'E_ALL & ~E_DEPRECATED');

  const caBundlePath = options?.caBundlePath;
  if (caBundlePath && isValidCaBundle(caBundlePath)) {
    content = setIniDirective(content, 'curl.cainfo', caBundlePath);
    content = setIniDirective(content, 'openssl.cafile', caBundlePath);
  } else {
    content = clearIniDirective(content, 'curl.cainfo');
    content = clearIniDirective(content, 'openssl.cafile');
  }

  for (const ext of PHP_RECOMMENDED_EXTENSIONS) {
    content = enableExtensionInIni(content, ext, extDir);
  }

  if (process.platform === 'win32') {
    content = configureOpcacheForWindows(content, root, extDir);
  }

  fs.writeFileSync(iniPath, content, 'utf8');
  return iniPath;
}

export { PHP_RECOMMENDED_EXTENSIONS, enableRecommendedExtensions };
