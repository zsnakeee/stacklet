import { describe, expect, it, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { bestInstalledMatch, nvmVersionDir, readNvmrc } from '../nvm';

const tmpDirs: string[] = [];

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacklet-nvm-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('bestInstalledMatch', () => {
  const installed = ['18.17.0', '18.20.3', '20.11.0', '16.20.0'];

  it('returns an exact match', () => {
    expect(bestInstalledMatch('20.11.0', installed)).toBe('20.11.0');
  });

  it('resolves a major-only spec to the highest matching version', () => {
    expect(bestInstalledMatch('18', installed)).toBe('18.20.3');
  });

  it('strips a leading v', () => {
    expect(bestInstalledMatch('v16', installed)).toBe('16.20.0');
  });

  it('returns null when nothing matches', () => {
    expect(bestInstalledMatch('22', installed)).toBeNull();
    expect(bestInstalledMatch('18', [])).toBeNull();
  });
});

describe('readNvmrc', () => {
  it('reads .nvmrc and strips a leading v', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, '.nvmrc'), 'v20.11.0\n');
    expect(readNvmrc(dir)).toBe('20.11.0');
  });

  it('falls back to .node-version', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, '.node-version'), '18.20.3');
    expect(readNvmrc(dir)).toBe('18.20.3');
  });

  it('returns null when neither file exists', () => {
    expect(readNvmrc(makeTmp())).toBeNull();
  });
});

describe('nvmVersionDir', () => {
  it('finds a v-prefixed runtime folder holding node.exe', () => {
    const home = makeTmp();
    const verDir = path.join(home, 'v20.11.0');
    fs.mkdirSync(verDir);
    fs.writeFileSync(path.join(verDir, 'node.exe'), '');
    expect(nvmVersionDir('20.11.0', home)).toBe(verDir);
  });

  it('returns null when the version is not present', () => {
    expect(nvmVersionDir('20.11.0', makeTmp())).toBeNull();
    expect(nvmVersionDir('20.11.0', null)).toBeNull();
  });
});
