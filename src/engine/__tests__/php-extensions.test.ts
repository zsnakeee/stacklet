import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deduplicateExtensionInIni,
  disableExtensionInIni,
  enableExtensionInIni,
  listPhpExtensions,
  setPhpExtensionEnabled,
} from '../php-extensions';

describe('php extensions', () => {
  let root: string;

  beforeEach(() => {
    root = path.join(os.tmpdir(), `devmgr-php-ext-${process.pid}-${Date.now()}`);
    fs.mkdirSync(path.join(root, 'ext'), { recursive: true });
    fs.writeFileSync(path.join(root, 'php.exe'), '');
    fs.writeFileSync(path.join(root, 'ext', 'php_mysqli.dll'), '');
    fs.writeFileSync(path.join(root, 'ext', 'php_curl.dll'), '');
    fs.writeFileSync(
      path.join(root, 'php.ini'),
      ';extension=mysqli\n;extension=curl\n',
      'utf8',
    );
  });

  afterEach(() => {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists extensions with enabled state', () => {
    const list = listPhpExtensions(root);
    expect(list.map((e) => e.name).sort()).toEqual(['curl', 'mysqli']);
    expect(list.find((e) => e.name === 'mysqli')?.enabled).toBe(false);
  });

  it('deduplicates duplicate extension lines', () => {
    let content = fs.readFileSync(path.join(root, 'php.ini'), 'utf8');
    content += '\nextension=mysqli\nextension=php_mysqli.dll\n';
    content = deduplicateExtensionInIni(content, 'mysqli');
    const matches = content.match(/^extension=.*mysqli/im) ?? [];
    expect(matches.length).toBe(1);
  });

  it('enables and disables extension in ini', () => {
    let content = fs.readFileSync(path.join(root, 'php.ini'), 'utf8');
    content = enableExtensionInIni(content, 'mysqli', path.join(root, 'ext'));
    if (process.platform === 'win32') {
      expect(content).toMatch(/^extension=php_mysqli\.dll\s*$/m);
    } else {
      expect(content).toMatch(/^extension=mysqli\s*$/m);
    }

    content = disableExtensionInIni(content, 'mysqli');
    expect(content).not.toMatch(/^extension=mysqli\s*$/m);

    setPhpExtensionEnabled(root, 'curl', true, { verify: false });
    const list = listPhpExtensions(root);
    expect(list.find((e) => e.name === 'curl')?.enabled).toBe(true);
  });
});
