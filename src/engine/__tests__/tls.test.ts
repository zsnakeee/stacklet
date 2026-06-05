import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config/defaults';
import type { Site } from '../../config/types';
import forge from 'node-forge';
import {
  collectTlsSanNames,
  DEV_MGR_LEAF_CN,
  ensureDevCerts,
  ensureFullChainCert,
  readLeafSanNames,
} from '../tls';
import { getLeafCertPath } from '../../shared/paths';
import { getFullChainCertPath } from '../../shared/paths';

describe('collectTlsSanNames', () => {
  it('includes site hostnames and phpMyAdmin', () => {
    const config = defaultConfig();
    config.services.phpmyadmin.enabled = true;
    config.services.phpmyadmin.hostname = 'phpmyadmin.test';
    const sites: Site[] = [
      {
        name: 'cpa',
        hostname: 'cpa-saas.test',
        root: 'C:/cpa',
        doc_root: 'C:/cpa/public',
        framework: 'laravel',
      },
    ];
    const names = collectTlsSanNames(config, sites);
    expect(names).toContain('phpmyadmin.test');
    expect(names).toContain('cpa-saas.test');
    expect(names).toContain('*.test');
  });
});

describe('ensureDevCerts', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-certs-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('creates CA and leaf certificate files', () => {
    const paths = ensureDevCerts(['*.test', 'dev-mgr.local', 'test', 'phpmyadmin.test']);
    expect(fs.existsSync(paths.caCertPath)).toBe(true);
    expect(fs.existsSync(paths.leafCertPath)).toBe(true);
    expect(fs.readFileSync(paths.leafCertPath, 'utf8')).toContain('BEGIN CERTIFICATE');
    expect(readLeafSanNames()).toContain('phpmyadmin.test');
    const leaf = forge.pki.certificateFromPem(fs.readFileSync(getLeafCertPath(), 'utf8'));
    const cn = leaf.subject.getField('CN')?.value;
    expect(cn).toBe(DEV_MGR_LEAF_CN);
  });

  it('writes fullchain.crt with leaf and CA', () => {
    ensureDevCerts(['*.test', 'dev-mgr.local', 'test']);
    const chainPath = ensureFullChainCert();
    expect(chainPath).toBe(getFullChainCertPath());
    const chain = fs.readFileSync(chainPath, 'utf8');
    expect(chain.match(/BEGIN CERTIFICATE/g)?.length).toBe(2);
  });

  it('is idempotent when SAN list is unchanged', () => {
    const sans = ['*.test', 'dev-mgr.local', 'test', 'app.test'];
    const first = ensureDevCerts(sans);
    const caMtime = fs.statSync(first.caCertPath).mtimeMs;
    const leafMtime = fs.statSync(first.leafCertPath).mtimeMs;
    const second = ensureDevCerts(sans);
    expect(fs.statSync(second.caCertPath).mtimeMs).toBe(caMtime);
    expect(fs.statSync(second.leafCertPath).mtimeMs).toBe(leafMtime);
  });

  it('regenerates leaf when a new hostname is required', () => {
    ensureDevCerts(['*.test', 'dev-mgr.local', 'test']);
    const before = readLeafSanNames();
    expect(before).not.toContain('phpmyadmin.test');

    ensureDevCerts(['*.test', 'dev-mgr.local', 'test', 'phpmyadmin.test']);
    const after = readLeafSanNames();
    expect(after).toContain('phpmyadmin.test');
  });
});
