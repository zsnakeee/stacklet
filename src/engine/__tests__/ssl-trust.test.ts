import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCertSha1Thumbprint, isLocalCaTrusted } from '../ssl-trust';
import { ensureDevCerts } from '../tls';

describe('ssl-trust', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-ssl-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('returns null for a missing file', () => {
    expect(getCertSha1Thumbprint('C:\\nonexistent\\ca.crt')).toBeNull();
  });

  it('matches certutil Cert Hash(sha1), not certutil -hashfile', () => {
    if (process.platform !== 'win32') return;

    const { caCertPath } = ensureDevCerts();
    const thumb = getCertSha1Thumbprint(caCertPath);
    expect(thumb).toMatch(/^[0-9a-f]{40}$/);

    const fileHash = spawnSync('certutil', ['-hashfile', caCertPath, 'SHA1'], {
      encoding: 'utf8',
    });
    const fileLine = (fileHash.stdout ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^[0-9a-f]{2}( [0-9a-f]{2}){19}$/i.test(l));
    const fileHex = fileLine?.replace(/ /g, '').toLowerCase();
    expect(fileHex).not.toBe(thumb);

    const dump = spawnSync('certutil', ['-dump', caCertPath], { encoding: 'utf8' });
    const m = (dump.stdout ?? '').match(/Cert Hash\(sha1\):\s*([0-9a-f]+)/i);
    expect(thumb).toBe(m?.[1]?.toLowerCase());
  });

  it('detects trust only when the active CA thumbprint is in the root store', () => {
    if (process.platform !== 'win32') return;
    const { caCertPath } = ensureDevCerts();
    const thumb = getCertSha1Thumbprint(caCertPath);
    if (!thumb) return;
    const machine = spawnSync('certutil', ['-store', 'Root'], { encoding: 'utf8' });
    const user = spawnSync('certutil', ['-store', '-user', 'Root'], { encoding: 'utf8' });
    const normalized = (machine.stdout ?? '') + (user.stdout ?? '');
    const inStore = normalized.toLowerCase().replace(/ /g, '').includes(thumb);
    expect(isLocalCaTrusted(caCertPath)).toBe(inStore);
  });
});
