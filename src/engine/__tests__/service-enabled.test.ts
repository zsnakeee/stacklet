import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config/defaults';
import { saveConfig } from '../../config/store';
import { Orchestrator } from '../orchestrator';

describe('service enabled / autostart', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-enabled-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
    fs.mkdirSync(path.join(dataDir, 'devmgr'), { recursive: true });
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('excludes disabled postgres from autostart list', () => {
    const config = defaultConfig();
    config.services.postgres.enabled = false;
    config.services.postgres.binary = 'C:\\fake\\pg_ctl.exe';
    fs.mkdirSync(path.dirname(config.services.postgres.binary), { recursive: true });
    fs.writeFileSync(config.services.postgres.binary, '');
    saveConfig(config);

    const engine = Orchestrator.createInitialized();
    expect(engine.getInstalledStartableNames()).not.toContain('postgres');
  });
});
