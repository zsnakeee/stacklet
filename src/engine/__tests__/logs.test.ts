import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogAllowlist } from '../logs/allowlist';
import { readTailLines } from '../logs/read-tail';
import { buildLogSources } from '../logs/sources';

describe('logs', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-logs-'));
    process.env['LOCALAPPDATA'] = tmp;
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('readTailLines returns last lines only', () => {
    const file = path.join(tmp, 'test.log');
    fs.writeFileSync(file, 'line1\nline2\nline3\nline4\nline5\n', 'utf8');
    const lines = readTailLines(file, 2);
    expect(lines).toEqual(['line4', 'line5']);
  });

  it('allowlist rejects unknown source id', () => {
    const sources = buildLogSources([], '8.3');
    const allowlist = new LogAllowlist(sources, [path.join(tmp, 'devmgr', 'logs')]);
    expect(() => allowlist.resolve('evil:log')).toThrow(/unknown/);
  });
});
