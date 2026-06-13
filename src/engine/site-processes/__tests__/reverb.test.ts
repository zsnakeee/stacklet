import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectReverbInstalled, shouldRunReverb } from '../reverb';
import type { Site } from '../../../config/types';

describe('detectReverbInstalled', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-reverb-detect-'));
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects laravel/reverb in composer.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'composer.json'),
      JSON.stringify({ require: { 'laravel/reverb': '^1.0' } }),
      'utf8',
    );
    const site: Site = {
      name: 'app',
      hostname: 'app.test',
      root: tmpDir,
      doc_root: tmpDir,
      framework: 'laravel',
    };
    expect(detectReverbInstalled(site)).toBe(true);
  });

  it('returns false when Reverb is not present', () => {
    const site: Site = {
      name: 'app',
      hostname: 'app.test',
      root: tmpDir,
      doc_root: tmpDir,
      framework: 'laravel',
    };
    expect(detectReverbInstalled(site)).toBe(false);
  });
});

describe('shouldRunReverb', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-reverb-run-'));
    fs.writeFileSync(
      path.join(tmpDir, 'composer.json'),
      JSON.stringify({ require: { 'laravel/reverb': '^1.0' } }),
      'utf8',
    );
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('requires Laravel, enabled site, enabled reverb, and installed package', () => {
    const site: Site = {
      name: 'app',
      hostname: 'app.test',
      root: tmpDir,
      doc_root: tmpDir,
      framework: 'laravel',
      enabled: true,
      reverb: { enabled: true, port: 8080 },
    };
    expect(shouldRunReverb(site)).toBe(true);
  });

  it('skips disabled sites', () => {
    const site: Site = {
      name: 'app',
      hostname: 'app.test',
      root: tmpDir,
      doc_root: tmpDir,
      framework: 'laravel',
      enabled: false,
      reverb: { enabled: true, port: 8080 },
    };
    expect(shouldRunReverb(site)).toBe(false);
  });
});
