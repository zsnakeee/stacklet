import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config/defaults';
import {
  collectEnvPaths,
  listEnvPathCandidates,
  resolveSelectedPathIds,
} from '../collect-env-paths';

describe('collectEnvPaths', () => {
  let tmp = '';

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-env-'));
    const phpDir = path.join(tmp, 'php', '8.5.6');
    const nginxDir = path.join(tmp, 'nginx');
    fs.mkdirSync(phpDir, { recursive: true });
    fs.mkdirSync(nginxDir, { recursive: true });
    fs.writeFileSync(path.join(phpDir, 'php.exe'), '');
    fs.writeFileSync(path.join(nginxDir, 'nginx.exe'), '');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('lists candidates for enabled services', () => {
    const config = defaultConfig();
    config.services.php.enabled = true;
    config.services.php.php_binary = path.join(tmp, 'php', '8.5.6', 'php.exe');
    config.services.nginx.enabled = true;
    config.services.nginx.binary = path.join(tmp, 'nginx', 'nginx.exe');

    const candidates = listEnvPathCandidates(config);
    expect(candidates.some((c) => c.id === 'php:bin')).toBe(true);
    expect(candidates.some((c) => c.id === 'nginx:bin')).toBe(true);
  });

  it('only adds selected paths', () => {
    const config = defaultConfig();
    config.services.php.enabled = true;
    config.services.php.php_binary = path.join(tmp, 'php', '8.5.6', 'php.exe');
    config.services.nginx.enabled = true;
    config.services.nginx.binary = path.join(tmp, 'nginx', 'nginx.exe');
    config.general.path_env_selected = ['php:bin'];

    const paths = collectEnvPaths(config);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe(path.normalize(path.join(tmp, 'php', '8.5.6')));
  });

  it('legacy path_in_env false selects nothing', () => {
    const config = defaultConfig();
    config.services.php.enabled = true;
    config.services.php.php_binary = path.join(tmp, 'php', '8.5.6', 'php.exe');
    config.general.path_in_env = false;

    expect(resolveSelectedPathIds(config, listEnvPathCandidates(config))).toEqual([]);
  });
});
