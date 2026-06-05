import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as http from '../../bundled/resolvers/http';
import { writePhpInstallMeta } from '../../bundled/php-install-meta';
import {
  PECL_RELEASES_BASES,
  peclZipUrl,
  phpVersionFromPeclZip,
  resolvePeclZipUrl,
} from '../pecl-installer';
import { detectPhpBuild } from '../php-build';

describe('pecl installer', () => {
  let root: string;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `devmgr-pecl-${process.pid}-${Date.now()}`);
    fs.mkdirSync(path.join(root, 'ext'), { recursive: true });
    writePhpInstallMeta(root, 'nts-vs16-x64');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('detects PHP version from install directory name when php.exe cannot run', () => {
    const versioned = path.join(path.dirname(root), '8.5.6');
    fs.mkdirSync(versioned, { recursive: true });
    fs.writeFileSync(path.join(versioned, 'php.exe'), '');
    const build = detectPhpBuild(versioned, { strict: true });
    expect(build.version).toBe('8.5.6');
    expect(build.majorMinor).toBe('8.5');
    fs.rmSync(versioned, { recursive: true, force: true });
  });

  it('parses PHP version from PECL zip filename', () => {
    expect(phpVersionFromPeclZip('php_redis-5.3.7-8.3-nts-vs16-x64.zip', 'redis')).toBe('8.3');
    expect(phpVersionFromPeclZip('php_redis-6.3.0-8.5-nts-vs17-x64.zip', 'redis')).toBe('8.5');
    expect(phpVersionFromPeclZip('php_redis-6.3.0-8.4-nts-vs17-x64.zip', 'redis')).toBe('8.4');
  });

  it('builds PECL download URL from version segments', () => {
    const base = PECL_RELEASES_BASES[0];
    expect(peclZipUrl(base, 'redis', '6.3.0', 'php_redis-6.3.0-8.5-nts-vs17-x64.zip')).toBe(
      'https://downloads.php.net/~windows/pecl/releases/redis/6.3.0/php_redis-6.3.0-8.5-nts-vs17-x64.zip',
    );
  });

  it('resolves a matching PECL zip URL from downloads.php.net', async () => {
    vi.spyOn(http, 'fetchText').mockImplementation(async (url: string) => {
      if (url.includes('/redis/') && !url.includes('/redis/6.')) {
        return '<a href="6.3.0/">6.3.0/</a><a href="5.3.7/">5.3.7/</a>';
      }
      if (url.endsWith('/redis/6.3.0/')) {
        return [
          '<a href="php_redis-6.3.0-8.5-nts-vs17-x64.zip">zip</a>',
          '<a href="php_redis-6.3.0-8.4-nts-vs17-x64.zip">zip</a>',
        ].join('');
      }
      throw new Error(`unexpected ${url}`);
    });

    const build = detectPhpBuild(root);
    build.majorMinor = '8.5';
    build.version = '8.5.0';
    build.vs = 'vs17';
    build.variantKey = 'nts-vs17-x64';
    const url = await resolvePeclZipUrl('redis', build);
    expect(url).toBe(
      'https://downloads.php.net/~windows/pecl/releases/redis/6.3.0/php_redis-6.3.0-8.5-nts-vs17-x64.zip',
    );
  });
});
