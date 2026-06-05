import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addRegisteredSite,
  loadSitesFromRegistry,
  removeRegisteredSite,
} from '../sites-registry';

describe('sites registry', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-sites-reg-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('registers and loads a site by path', () => {
    const root = path.join(dataDir, 'proj');
    fs.mkdirSync(path.join(root, 'public'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artisan'), '');

    addRegisteredSite('my-app', root);
    const sites = loadSitesFromRegistry();
    expect(sites).toHaveLength(1);
    expect(sites[0].hostname).toBe('my-app.test');
    expect(sites[0].doc_root).toContain('public');
  });

  it('removes a registered site', () => {
    const root = path.join(dataDir, 'x');
    fs.mkdirSync(root, { recursive: true });
    addRegisteredSite('x', root);
    removeRegisteredSite('x');
    expect(loadSitesFromRegistry()).toHaveLength(0);
  });
});
