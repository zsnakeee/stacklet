import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initConfig, loadConfig, saveConfig } from '../store';

describe('config store', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-config-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('creates default config on init', () => {
    const config = initConfig();
    expect(config.general.web_server).toBe('nginx');
    expect(fs.existsSync(path.join(dataDir, 'devmgr', 'config.toml'))).toBe(true);
  });

  it('round-trips park_path', () => {
    const config = initConfig();
    config.general.park_path = 'C:\\sites';
    saveConfig(config);
    const loaded = loadConfig();
    expect(loaded.general.park_path).toBe('C:\\sites');
  });
});
