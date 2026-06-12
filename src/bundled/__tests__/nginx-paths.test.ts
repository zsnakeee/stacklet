import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyManifestToConfig } from '../sync-config';
import {
  configureNginxInstall,
  nginxPathsFromInstallRoot,
  ensureNginxMainConfig,
  resolveNginxInstallRoot,
} from '../nginx-paths';
import { defaultConfig } from '../../config/defaults';

describe('nginx paths', () => {
  let dataDir: string;
  const version = '1.26.2';

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `devmgr-nginx-paths-${process.pid}-${Date.now()}`);
    process.env['LOCALAPPDATA'] = dataDir;
    const installRoot = path.join(dataDir, 'devmgr', 'services', 'nginx', version);
    fs.mkdirSync(path.join(installRoot, 'conf'), { recursive: true });
    fs.mkdirSync(path.join(installRoot, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(installRoot, 'nginx.exe'), '');
    fs.writeFileSync(path.join(installRoot, 'conf', 'nginx.conf'), 'events {}\n');
  });

  afterEach(() => {
    delete process.env['LOCALAPPDATA'];
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('resolves install root under services/nginx/{version}', () => {
    const installRoot = path.join(dataDir, 'devmgr', 'services', 'nginx', version);
    const root = resolveNginxInstallRoot(version, installRoot);
    expect(root).toBe(installRoot);

    const paths = nginxPathsFromInstallRoot(root);
    expect(paths?.binary).toBe(path.join(installRoot, 'nginx.exe'));
    expect(paths?.prefix).toBe(installRoot);
    expect(paths?.config).toBe(path.join(installRoot, 'conf', 'nginx.conf'));
  });

  it('applyManifestToConfig uses version directory as prefix', () => {
    const installRoot = path.join(dataDir, 'devmgr', 'services', 'nginx', version);
    const config = applyManifestToConfig(defaultConfig(), {
      nginx: { version, path: installRoot, installedAt: new Date().toISOString() },
    });

    expect(config.services.nginx.prefix).toBe(installRoot);
    expect(config.services.nginx.binary).toBe(path.join(installRoot, 'nginx.exe'));
    expect(config.services.nginx.config).toBe(path.join(installRoot, 'conf', 'nginx.conf'));
  });

  it('configureNginxInstall includes vhosts inside http and disables stock welcome', () => {
    const installRoot = path.join(dataDir, 'devmgr', 'services', 'nginx', version);
    const confPath = path.join(installRoot, 'conf', 'nginx.conf');
    fs.writeFileSync(
      confPath,
      `worker_processes 1;
events { worker_connections 1024; }
http {
    server {
        listen       80;
        server_name  localhost;
        location / {
            root   html;
            index  index.html index.htm;
        }
    }
}
`,
      'utf8',
    );

    configureNginxInstall(installRoot);
    const conf = fs.readFileSync(confPath, 'utf8');

    expect(conf).toContain('# stacklet');
    expect(conf).toContain('stacklet-http.conf');
    expect(conf).toContain('stacklet-sites.conf');
    expect(conf).not.toMatch(/^\s*keepalive_timeout\s/m);
    const httpStart = conf.indexOf('http {');
    const httpEnd = conf.indexOf('\n}', httpStart);
    const httpBlock = conf.slice(httpStart, httpEnd);
    expect(httpBlock).not.toMatch(/^\s*keepalive_timeout\s/m);
    expect(httpBlock).toContain('stacklet-http.conf');
    expect(conf).toContain('# stacklet: stock welcome disabled');
    expect(conf).not.toMatch(/^\s*server\s*\{[^#]*server_name\s+localhost/m);

    const includeIdx = conf.indexOf('stacklet-sites.conf');
    expect(includeIdx).toBeGreaterThan(httpStart);
    expect(includeIdx).toBeLessThan(httpEnd);
  });

  it('ensureNginxMainConfig moves include inside http when previously appended outside', () => {
    const installRoot = path.join(dataDir, 'devmgr', 'services', 'nginx', version);
    const confPath = path.join(installRoot, 'conf', 'nginx.conf');
    const badInclude = 'C:/devmgr/generated/nginx/devmgr-sites.conf';
    fs.writeFileSync(
      confPath,
      `events {}
http {
  keepalive_timeout 65;
  sendfile on;
  server { listen 80; server_name localhost; location / { root html; } }
}
# dev-mgr
include "${badInclude}";
`,
      'utf8',
    );

    ensureNginxMainConfig(confPath);
    const conf = fs.readFileSync(confPath, 'utf8');
    const httpStart = conf.indexOf('http {');
    const httpEnd = conf.indexOf('\n}', httpStart);
    const httpBlock = conf.slice(httpStart, httpEnd);
    expect(httpBlock).not.toMatch(/^\s*keepalive_timeout\s/m);
    const includeIdx = conf.indexOf('stacklet-sites.conf');
    expect(includeIdx).toBeGreaterThan(httpStart);
    expect(includeIdx).toBeLessThan(httpEnd);
    expect(conf.slice(httpEnd + 1).trim()).not.toContain('stacklet-sites.conf');
  });
});
