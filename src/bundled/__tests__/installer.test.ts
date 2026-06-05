import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installService } from '../installer';
import { getInstalledRecord, isInstalled } from '../registry';
import { uninstallService } from '../uninstall';

describe('installService (mock)', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-install-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
    process.env['DEVMGR_MOCK_INSTALL'] = '1';
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    delete process.env['DEVMGR_MOCK_INSTALL'];
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('installs nginx and records manifest', async () => {
    const root = await installService('nginx', '1.26.2');
    expect(fs.existsSync(path.join(root, 'nginx.exe'))).toBe(true);
    expect(isInstalled('nginx')).toBe(true);
    expect(getInstalledRecord('nginx')?.version).toBe('1.26.2');
  });

  it('uninstall removes files and manifest', async () => {
    await installService('redis', '5.0.14.1');
    await uninstallService('redis');
    expect(isInstalled('redis')).toBe(false);
  });

  it('installs another PHP version without removing the first', async () => {
    const a = await installService('php', '8.5.6');
    const b = await installService('php', '8.4.0');
    expect(fs.existsSync(path.join(a, 'php.exe'))).toBe(true);
    expect(fs.existsSync(path.join(b, 'php-cgi.exe'))).toBe(true);
    expect(getInstalledRecord('php')?.version).toBe('8.4.0');
  });
});
