import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveHelperRuntime, resolveServerPath } from '../elevate';

describe('elevate', () => {
  let savedNodeExecPath: string | undefined;

  beforeEach(() => {
    savedNodeExecPath = process.env['npm_node_execpath'];
  });

  afterEach(() => {
    if (savedNodeExecPath === undefined) {
      delete process.env['npm_node_execpath'];
    } else {
      process.env['npm_node_execpath'] = savedNodeExecPath;
    }
  });

  it('resolveServerPath finds dist/helper/server.js', () => {
    const serverPath = resolveServerPath();
    expect(fs.existsSync(serverPath)).toBe(true);
    expect(serverPath).toMatch(/server\.js$/);
  });

  it('resolveHelperRuntime prefers npm_node_execpath', () => {
    const fakeNode = path.join(os.tmpdir(), `devmgr-fake-node-${process.pid}.exe`);
    fs.writeFileSync(fakeNode, '');
    process.env['npm_node_execpath'] = fakeNode;

    const runtime = resolveHelperRuntime();
    expect(runtime.executable).toBe(fakeNode);
    expect(runtime.useElectronRunAsNode).toBe(false);

    fs.unlinkSync(fakeNode);
  });
});
