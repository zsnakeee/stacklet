import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyReverbEnv, suggestReverbEnv } from '../reverb-env';
import type { Site } from '../../config/types';

describe('suggestReverbEnv', () => {
  it('uses the site hostname and nginx ssl port for client settings', () => {
    const site: Site = {
      name: 'shop',
      hostname: 'shop.test',
      root: 'C:/sites/shop',
      doc_root: 'C:/sites/shop/public',
      framework: 'laravel',
    };
    expect(suggestReverbEnv(site, 443, 8080)).toEqual({
      REVERB_HOST: 'shop.test',
      REVERB_PORT: '443',
      REVERB_SCHEME: 'https',
      REVERB_SERVER_HOST: '127.0.0.1',
      REVERB_SERVER_PORT: '8080',
      VITE_REVERB_HOST: '${REVERB_HOST}',
      VITE_REVERB_PORT: '${REVERB_PORT}',
      VITE_REVERB_SCHEME: '${REVERB_SCHEME}',
    });
  });
});

describe('applyReverbEnv', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-reverb-env-'));
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('patches managed keys without touching REVERB_APP_* secrets', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(
      envPath,
      'REVERB_APP_KEY=secret-key\nREVERB_HOST=old.test\n',
      'utf8',
    );
    const site: Site = {
      name: 'shop',
      hostname: 'shop.test',
      root: tmpDir,
      doc_root: path.join(tmpDir, 'public'),
      framework: 'laravel',
      reverb: { enabled: true, port: 8081 },
    };
    const updated = applyReverbEnv(site, 443, 8081);
    const content = fs.readFileSync(envPath, 'utf8');
    expect(content).toContain('REVERB_APP_KEY=secret-key');
    expect(content).toContain('REVERB_HOST=shop.test');
    expect(content).toContain('REVERB_SERVER_PORT=8081');
    expect(updated).toContain('REVERB_HOST');
  });
});
