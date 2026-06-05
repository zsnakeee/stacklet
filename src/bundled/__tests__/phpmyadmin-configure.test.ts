import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensurePhpMyAdminConfig } from '../phpmyadmin-configure';

describe('ensurePhpMyAdminConfig', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-pma-'));
    fs.writeFileSync(path.join(root, 'index.php'), '<?php', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes config.inc.php with AllowNoPassword and tuning', () => {
    expect(ensurePhpMyAdminConfig(root, { mysql_port: 3307 })).toBe(true);
    const content = fs.readFileSync(path.join(root, 'config.inc.php'), 'utf8');
    expect(content).toContain('AllowNoPassword');
    expect(content).toContain("['port'] = '3307'");
    expect(content).toContain("['host'] = '127.0.0.1'");
    expect(content).toContain("$cfg['MaxSize']");
    expect(content).toContain("$cfg['LoginCookieValidity']");
  });
});
