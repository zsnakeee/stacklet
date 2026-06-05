import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HOSTS_MARKER_BEGIN,
  HOSTS_MARKER_END,
  hostsAdd,
  hostsFileHasAllEntries,
  hostsRemove,
  hostsSync,
} from '../hosts';

describe('hosts', () => {
  let hostsPath: string;

  beforeEach(() => {
    hostsPath = path.join(
      os.tmpdir(),
      `devmgr-hosts-${process.pid}-${Date.now()}.txt`,
    );
    process.env['DEVMGR_HOSTS_PATH'] = hostsPath;
  });

  afterEach(() => {
    delete process.env['DEVMGR_HOSTS_PATH'];
    if (fs.existsSync(hostsPath)) {
      fs.unlinkSync(hostsPath);
    }
  });

  it('adds a hostname inside the devmgr marker block', () => {
    hostsAdd('127.0.0.1', 'app.test', hostsPath);
    const content = fs.readFileSync(hostsPath, 'utf8');
    expect(content).toContain(HOSTS_MARKER_BEGIN);
    expect(content).toContain(HOSTS_MARKER_END);
    expect(content).toMatch(/127\.0\.0\.1\s+app\.test/);
  });

  it('replaces an existing mapping for the same hostname', () => {
    hostsAdd('127.0.0.1', 'app.test', hostsPath);
    hostsAdd('127.0.0.2', 'app.test', hostsPath);
    const content = fs.readFileSync(hostsPath, 'utf8');
    const matches = content.match(/app\.test/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(content).toMatch(/127\.0\.0\.2\s+app\.test/);
  });

  it('removes a hostname entry', () => {
    hostsAdd('127.0.0.1', 'app.test', hostsPath);
    hostsRemove('app.test', hostsPath);
    const content = fs.readFileSync(hostsPath, 'utf8');
    expect(content).not.toMatch(/app\.test/);
  });

  it('detects when all hostnames are already mapped', () => {
    hostsSync(['app.test', 'phpmyadmin.test'], '127.0.0.1', hostsPath);
    const ok = hostsFileHasAllEntries(['app.test', 'phpmyadmin.test'], '127.0.0.1', hostsPath);
    expect(ok.complete).toBe(true);
    expect(ok.missing).toEqual([]);
  });

  it('reports missing hostnames before sync', () => {
    hostsAdd('127.0.0.1', 'app.test', hostsPath);
    const check = hostsFileHasAllEntries(['app.test', 'other.test'], '127.0.0.1', hostsPath);
    expect(check.complete).toBe(false);
    expect(check.missing).toEqual(['other.test']);
  });

  it('syncs many hostnames in one write', () => {
    hostsSync(['app.test', 'phpmyadmin.test'], '127.0.0.1', hostsPath);
    const content = fs.readFileSync(hostsPath, 'utf8');
    expect(content).toMatch(/127\.0\.0\.1\s+app\.test/);
    expect(content).toMatch(/127\.0\.0\.1\s+phpmyadmin\.test/);
    hostsSync(['app.test'], '127.0.0.1', hostsPath);
    const trimmed = fs.readFileSync(hostsPath, 'utf8');
    expect(trimmed).not.toMatch(/phpmyadmin\.test/);
  });
});
