import fs from 'fs';
import path from 'path';
import {
  opcacheCacheIdForPhpRoot,
  opcacheFileCacheDirForPhpRoot,
} from '../../bundled/php-configure';
import { PHP_FASTCGI_PORT } from '../service-ports';

/** E_ALL without E_DEPRECATED — keeps deprecations off stderr (nginx 502 on Windows). */
export const PHP_FASTCGI_ERROR_REPORTING = 24575;

/** Prefer php-cgi.exe next to php.exe when config still points at php.exe. */
export function resolvePhpCgiBinary(fpmBinary: string, phpBinary?: string): string {
  if (fpmBinary && path.basename(fpmBinary).toLowerCase().includes('php-cgi')) {
    return fpmBinary;
  }
  const dir = path.dirname(fpmBinary || phpBinary || '');
  if (!dir) return fpmBinary;
  const cgi = path.join(dir, 'php-cgi.exe');
  if (fs.existsSync(cgi)) return cgi;
  return fpmBinary;
}

export interface PhpCgiSpawnOptions {
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/** Prevent php-cgi from exiting after a fixed request count (common cause of random 502s). */
export const PHP_CGI_SPAWN_ENV: Record<string, string> = {
  PHP_FCGI_MAX_REQUESTS: '0',
};

/** Windows PHP listens for nginx via php-cgi.exe -b host:port (not plain php-cgi). */
export function buildPhpCgiSpawn(
  fpmBinary: string,
  port: number = PHP_FASTCGI_PORT,
): PhpCgiSpawnOptions {
  if (!fpmBinary) {
    throw new Error('php-fpm: PHP binary path is not configured');
  }

  const cwd = path.dirname(fpmBinary);
  const base = path.basename(fpmBinary).toLowerCase();

  if (base === 'php.exe') {
    const cgi = path.join(cwd, 'php-cgi.exe');
    throw new Error(
      `php-fpm: config points to php.exe; use php-cgi.exe for FastCGI (expected at ${cgi})`,
    );
  }

  if (!base.includes('php-cgi')) {
    throw new Error(
      `php-fpm: unsupported binary "${fpmBinary}" — Windows needs php-cgi.exe with -b 127.0.0.1:${PHP_FASTCGI_PORT}`,
    );
  }

  const args: string[] = [];

  if (process.platform === 'win32') {
    const fileCache = opcacheFileCacheDirForPhpRoot(cwd).replace(/\\/g, '/');
    args.push(
      '-d',
      `opcache.file_cache=${fileCache}`,
      '-d',
      'opcache.file_cache_fallback=1',
      '-d',
      `opcache.cache_id=${opcacheCacheIdForPhpRoot(cwd)}`,
    );
  }

  args.push(
    '-d',
    'display_errors=0',
    '-d',
    'log_errors=1',
    '-d',
    `error_reporting=${PHP_FASTCGI_ERROR_REPORTING}`,
  );

  const iniPath = path.join(cwd, 'php.ini');
  if (fs.existsSync(iniPath)) {
    args.push('-c', iniPath);
  }

  args.push('-b', `127.0.0.1:${port}`);

  return { args, cwd, env: { ...PHP_CGI_SPAWN_ENV } };
}
