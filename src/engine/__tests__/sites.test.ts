import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverSites, detectFramework, siteHostnameFromDirName } from '../sites';

describe('discoverSites', () => {
  let parkDir: string;

  beforeEach(() => {
    parkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-park-'));
  });

  afterEach(() => {
    fs.rmSync(parkDir, { recursive: true, force: true });
  });

  it('discovers subfolders as .test sites', () => {
    const app = path.join(parkDir, 'myapp');
    fs.mkdirSync(path.join(app, 'public'), { recursive: true });
    fs.writeFileSync(path.join(app, 'artisan'), '');

    const sites = discoverSites(parkDir);
    expect(sites).toHaveLength(1);
    expect(sites[0].hostname).toBe('myapp.test');
    expect(sites[0].framework).toBe('laravel');
    expect(sites[0].doc_root).toContain('public');
  });

  it('slugifies folder names with spaces for hostnames', () => {
    expect(siteHostnameFromDirName('Atmel Studio')).toBe('atmel-studio.test');
    expect(siteHostnameFromDirName('My App')).toBe('my-app.test');
  });

  it('discovers folder names with spaces using slug hostnames', () => {
    const app = path.join(parkDir, 'Atmel Studio');
    fs.mkdirSync(app, { recursive: true });

    const sites = discoverSites(parkDir);
    expect(sites).toHaveLength(1);
    expect(sites[0].hostname).toBe('atmel-studio.test');
    expect(sites[0].name).toBe('Atmel Studio');
  });

  it('detects wordpress', () => {
    const wp = path.join(parkDir, 'blog');
    fs.mkdirSync(path.join(wp, 'public'), { recursive: true });
    fs.writeFileSync(path.join(wp, 'wp-config.php'), '');

    expect(detectFramework(wp)).toBe('wordpress');
  });
});
