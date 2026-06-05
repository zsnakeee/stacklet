import fs from 'fs';
import path from 'path';
import { devMgrHttpConfPath, writeDevMgrHttpConf } from './nginx-configure';
import { getGeneratedDir } from '../shared/paths';
import { getInstallDir } from './registry';
import type { NginxOptions } from '../config/types';

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function findFile(root: string, name: string): string | null {
  const direct = path.join(root, name);
  if (exists(direct)) return direct;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(root, entry.name, name);
    if (exists(nested)) return nested;
  }
  return null;
}

/** Canonical install root: %LOCALAPPDATA%\\devmgr\\services\\nginx\\{version} */
export function resolveNginxInstallRoot(version: string, manifestPath: string): string {
  const canonical = getInstallDir('nginx', version);
  if (exists(path.join(canonical, 'nginx.exe'))) return canonical;
  if (exists(path.join(manifestPath, 'nginx.exe'))) return path.resolve(manifestPath);

  const found = findFile(manifestPath, 'nginx.exe');
  if (found) return path.dirname(found);

  return canonical;
}

export interface NginxPaths {
  binary: string;
  prefix: string;
  config: string;
}

/** All nginx paths live under the version install directory. */
export function nginxPathsFromInstallRoot(installRoot: string): NginxPaths | null {
  const root = path.resolve(installRoot);
  const binary = exists(path.join(root, 'nginx.exe'))
    ? path.join(root, 'nginx.exe')
    : findFile(root, 'nginx.exe');
  if (!binary) return null;

  return {
    binary,
    prefix: root,
    config: path.join(root, 'conf', 'nginx.conf'),
  };
}

const DEVMGR_MARKER = '# dev-mgr';

/** Index of the closing `}` for the top-level `http { ... }` block. */
function findHttpBlockEnd(conf: string): number {
  const match = /http\s*\{/.exec(conf);
  if (!match || match.index === undefined) return -1;

  let depth = 0;
  let started = false;
  for (let i = match.index; i < conf.length; i++) {
    if (conf[i] === '{') {
      depth++;
      started = true;
    } else if (conf[i] === '}') {
      depth--;
      if (started && depth === 0) return i;
    }
  }
  return -1;
}

/** Remove dev-mgr include blocks (fixes older patches that appended outside `http`). */
function stripDevMgrInclude(conf: string): string {
  return conf.replace(/\n\s*# dev-mgr\s*\n(?:\s*include\s+"[^"]+"\s*;\s*\n)+/g, '\n');
}

/** Directives owned by devmgr-http.conf — strip from main http {} to avoid duplicate errors. */
const HTTP_DIRECTIVES_IN_SNIPPET = [
  'client_max_body_size',
  'keepalive_timeout',
  'gzip',
  'sendfile',
  'server_names_hash_bucket_size',
];

function stripManagedHttpDirectives(conf: string): string {
  const match = /http\s*\{/.exec(conf);
  if (!match || match.index === undefined) return conf;

  const httpEnd = findHttpBlockEnd(conf);
  if (httpEnd === -1) return conf;

  let httpBlock = conf.slice(match.index, httpEnd);
  for (const name of HTTP_DIRECTIVES_IN_SNIPPET) {
    httpBlock = httpBlock.replace(
      new RegExp(`^[ \\t]*${name}[ \\t]+[^;\\r\\n]+;[ \\t]*\\r?\\n`, 'gm'),
      '',
    );
  }

  return conf.slice(0, match.index) + httpBlock + conf.slice(httpEnd);
}

function generatedIncludePaths(): { http: string; sites: string } {
  return {
    http: devMgrHttpConfPath().replace(/\\/g, '/'),
    sites: path.join(getGeneratedDir(), 'nginx', 'devmgr-sites.conf').replace(/\\/g, '/'),
  };
}

/** Inject dev-mgr includes at the start of `http { }` so tuning applies before vhosts. */
function injectDevMgrIncludes(conf: string, includePaths: string[]): string {
  let next = stripDevMgrInclude(conf);
  const lines = includePaths.map((p) => `include "${p}";`);
  const block = `\n    ${DEVMGR_MARKER}\n    ${lines.map((l) => `    ${l}`).join('\n')}\n`;

  const match = /http\s*\{/.exec(next);
  if (!match || match.index === undefined) {
    return `${next.trim()}\n\nhttp {${block}}\n`;
  }

  const insertAt = match.index + match[0].length;
  return next.slice(0, insertAt) + block + next.slice(insertAt);
}

/** Disable the bundled "Welcome to nginx" site on port 80 so named vhosts win. */
function disableStockWelcomeServer(conf: string): string {
  if (conf.includes('# dev-mgr: stock welcome disabled')) return conf;

  const nameIdx = conf.search(/server_name\s+localhost\s*;/);
  if (nameIdx === -1) return conf;

  const serverStart = conf.lastIndexOf('server {', nameIdx);
  if (serverStart === -1) return conf;

  let depth = 0;
  let serverEnd = -1;
  for (let i = serverStart; i < conf.length; i++) {
    if (conf[i] === '{') depth++;
    else if (conf[i] === '}') {
      depth--;
      if (depth === 0) {
        serverEnd = i + 1;
        break;
      }
    }
  }
  if (serverEnd === -1) return conf;

  const block = conf.slice(serverStart, serverEnd);
  if (!/listen\s+80\s*;/.test(block)) return conf;

  const commented = block
    .split('\n')
    .map((line) => (line.trim() ? `# ${line}` : '#'))
    .join('\n');

  return (
    conf.slice(0, serverStart) +
    `# dev-mgr: stock welcome disabled\n${commented}\n` +
    conf.slice(serverEnd)
  );
}

/** Patch bundled nginx.conf to use paths under the install prefix. */
export function configureNginxInstall(
  installRoot: string,
  httpOptions?: Partial<NginxOptions>,
): void {
  const root = path.resolve(installRoot);
  const confDir = path.join(root, 'conf');
  const logsDir = path.join(root, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const confPath = path.join(confDir, 'nginx.conf');
  if (!exists(confPath)) return;

  writeDevMgrHttpConf(httpOptions);
  const includes = generatedIncludePaths();

  let conf = fs.readFileSync(confPath, 'utf8');
  conf = stripManagedHttpDirectives(conf);
  conf = injectDevMgrIncludes(conf, [includes.http, includes.sites]);
  conf = disableStockWelcomeServer(conf);

  if (!/^\s*error_log\s/m.test(conf)) {
    conf += 'error_log logs/error.log;\n';
  }
  if (!/^\s*pid\s/m.test(conf)) {
    conf += 'pid logs/nginx.pid;\n';
  }

  fs.writeFileSync(confPath, conf, 'utf8');
}

/** Ensure main nginx.conf includes dev-mgr http tuning and vhosts. */
export function ensureNginxMainConfig(
  configPath: string,
  httpOptions?: Partial<NginxOptions>,
): void {
  if (!exists(configPath)) return;

  writeDevMgrHttpConf(httpOptions);
  const includes = generatedIncludePaths();

  let conf = fs.readFileSync(configPath, 'utf8');
  conf = stripManagedHttpDirectives(conf);
  conf = injectDevMgrIncludes(conf, [includes.http, includes.sites]);
  conf = disableStockWelcomeServer(conf);
  fs.writeFileSync(configPath, conf, 'utf8');
}
