import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureCaBundle, isValidCaBundle } from '../php-ca-bundle';
import { getCaBundlePath } from '../../shared/paths';

const VALID_PEM = `${'-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----\n'.repeat(64)}`;

vi.mock('../../bundled/download', () => ({
  downloadFile: vi.fn(async (_url: string, dest: string) => {
    fs.writeFileSync(dest, VALID_PEM);
  }),
}));

describe('isValidCaBundle', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = path.join(os.tmpdir(), `devmgr-ca-valid-${process.pid}-${Date.now()}.pem`);
  });

  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('accepts a PEM bundle with enough content', () => {
    fs.writeFileSync(tmp, VALID_PEM);
    expect(isValidCaBundle(tmp)).toBe(true);
  });

  it('rejects tiny or non-PEM files', () => {
    fs.writeFileSync(tmp, 'not-a-bundle');
    expect(isValidCaBundle(tmp)).toBe(false);
    expect(isValidCaBundle(path.join(os.tmpdir(), 'missing.pem'))).toBe(false);
  });
});

describe('ensureCaBundle', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-ca-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('downloads the bundle when missing', async () => {
    const bundlePath = await ensureCaBundle();
    expect(bundlePath).toBe(getCaBundlePath());
    expect(isValidCaBundle(bundlePath)).toBe(true);
  });

  it('reuses a valid existing bundle', async () => {
    const bundlePath = getCaBundlePath();
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
    fs.writeFileSync(bundlePath, VALID_PEM);

    const { downloadFile } = await import('../../bundled/download');
    await ensureCaBundle();
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('re-downloads when the existing bundle is invalid', async () => {
    const bundlePath = getCaBundlePath();
    fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
    fs.writeFileSync(bundlePath, 'broken');

    const { downloadFile } = await import('../../bundled/download');
    await ensureCaBundle();
    expect(downloadFile).toHaveBeenCalled();
    expect(isValidCaBundle(bundlePath)).toBe(true);
  });
});
