import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensurePhpIni } from '../php-configure';

describe('ensurePhpIni', () => {
  let root: string;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `devmgr-php-ini-${process.pid}-${Date.now()}`);
    fs.mkdirSync(path.join(root, 'ext'), { recursive: true });
    fs.writeFileSync(path.join(root, 'php.exe'), '');
    fs.writeFileSync(path.join(root, 'ext', 'php_mysqli.dll'), '');
    fs.writeFileSync(path.join(root, 'ext', 'php_mbstring.dll'), '');
    fs.writeFileSync(
      path.join(root, 'php.ini-development'),
      ';extension_dir = "ext"\n;extension=mysqli\n',
      'utf8',
    );
  });

  afterEach(() => {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates php.ini and enables mysqli', () => {
    const iniPath = ensurePhpIni(root);
    expect(iniPath).toBe(path.join(root, 'php.ini'));
    const content = fs.readFileSync(iniPath!, 'utf8');
    expect(content).toMatch(/^extension_dir\s*=/m);
    if (process.platform === 'win32') {
      expect(content).toMatch(/^extension=php_mysqli\.dll\s*$/m);
    } else {
      expect(content).toMatch(/^extension=mysqli\s*$/m);
    }
    expect(content).not.toMatch(/^;\s*extension=mysqli\s*$/m);
  });

  it('sets curl.cainfo and openssl.cafile when a CA bundle is provided', () => {
    const caBundle = path.join(root, 'cacert.pem');
    const pem = `${'-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----\n'.repeat(64)}`;
    fs.writeFileSync(caBundle, pem);

    ensurePhpIni(root, { caBundlePath: caBundle });
    const content = fs.readFileSync(path.join(root, 'php.ini'), 'utf8');
    expect(content).toMatch(/^curl\.cainfo\s*=\s*".*cacert\.pem"/m);
    expect(content).toMatch(/^openssl\.cafile\s*=\s*".*cacert\.pem"/m);
  });

  it('configures OPcache file cache on Windows (ASLR)', () => {
    if (process.platform !== 'win32') return;

    ensurePhpIni(root);
    const content = fs.readFileSync(path.join(root, 'php.ini'), 'utf8');
    expect(content).toMatch(/^opcache\.file_cache\s*=/m);
    expect(content).toMatch(/^opcache\.file_cache_fallback\s*=\s*1/m);
    expect(content).toMatch(/^opcache\.cache_id\s*=\s*devmgr-cgi-/m);
  });

  it('comments out stale CA paths when the bundle is missing', () => {
    const iniPath = path.join(root, 'php.ini');
    ensurePhpIni(root);
    fs.writeFileSync(
      iniPath,
      `${fs.readFileSync(iniPath, 'utf8')}\ncurl.cainfo = "C:/missing/cacert.pem"\nopenssl.cafile = "C:/missing/cacert.pem"\n`,
    );

    ensurePhpIni(root, { caBundlePath: 'C:/missing/cacert.pem' });
    const content = fs.readFileSync(iniPath, 'utf8');
    expect(content).toMatch(/^;\s*curl\.cainfo\s*=/m);
    expect(content).toMatch(/^;\s*openssl\.cafile\s*=/m);
    expect(content).not.toMatch(/^curl\.cainfo\s*=\s*"C:\/missing/m);
  });
});
