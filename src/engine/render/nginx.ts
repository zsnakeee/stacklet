import path from 'path';
import { mergeNginxOptions } from '../../bundled/nginx-configure';
import { isNodeFramework, type DevConfig, type Site } from '../../config/types';
import { PHP_FASTCGI_PORT, PHP_XDEBUG_PORT } from '../service-ports';
import {
  getFullChainCertPath,
  getGeneratedDir,
  getLeafKeyPath,
  getLogsDir,
} from '../../shared/paths';

/** Nginx path for directives; must be quoted when the path contains spaces. */
export function nginxPathLiteral(p: string): string {
  const normalized = path.resolve(p).replace(/\\/g, '/');
  if (!normalized) return '""';
  return `"${normalized.replace(/"/g, '\\"')}"`;
}

function nginxServerName(hostname: string): string {
  if (/[\s;]/.test(hostname)) {
    return `"${hostname.replace(/"/g, '\\"')}"`;
  }
  return hostname;
}

function listenDirectives(config: DevConfig, asDefault = false): string {
  const httpPort = config.services.nginx.port;
  const sslPort = config.services.nginx.ssl_port;
  const flag = asDefault ? ' default_server' : '';
  return `listen ${httpPort}${flag};\n  listen ${sslPort} ssl${flag};`;
}

/** Included vhosts live outside the nginx prefix; fastcgi_params must be absolute. */
function fastcgiParamsInclude(config: DevConfig): string {
  const prefix = config.services.nginx.prefix;
  if (!prefix) return 'fastcgi_params';
  return nginxPathLiteral(path.join(prefix, 'conf', 'fastcgi_params'));
}

function serverNames(site: Site): string {
  const names = [site.hostname, ...(site.aliases ?? [])].filter(Boolean);
  return names.map(nginxServerName).join(' ');
}

function clientMaxBodySizeDirective(config: DevConfig): string {
  const size = mergeNginxOptions(config.services.nginx.options).client_max_body_size;
  return `client_max_body_size ${size};`;
}

function reverbProxyLocations(port: number): string {
  const upstream = `http://127.0.0.1:${port}`;
  const headers = `
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Scheme $scheme;
    proxy_set_header SERVER_PORT $server_port;
    proxy_set_header REMOTE_ADDR $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";`.trim();

  return `
  location /app {
    ${headers}
    proxy_pass ${upstream};
  }

  location /apps {
    ${headers}
    proxy_pass ${upstream};
  }`.trim();
}

/** Reverse-proxy `location /` to a Node dev server (HMR/WebSocket aware). */
function devServerProxyLocation(config: DevConfig, port: number): string {
  return `
  location / {
    ${clientMaxBodySizeDirective(config)}
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
    proxy_buffering off;
  }`.trim();
}

function fastcgiPhpLocation(config: DevConfig, phpPort: number, xdebug = false): string {
  const opts = mergeNginxOptions(config.services.nginx.options);
  const bodyLimit = clientMaxBodySizeDirective(config);
  // On-demand Xdebug: route XDEBUG-triggered requests on the default port to the
  // Xdebug php-cgi; everything else stays on the fast instance.
  const passBlock =
    xdebug && phpPort === PHP_FASTCGI_PORT
      ? `set $php_upstream 127.0.0.1:${PHP_FASTCGI_PORT};
    if ($http_cookie ~* "XDEBUG_SESSION") { set $php_upstream 127.0.0.1:${PHP_XDEBUG_PORT}; }
    if ($arg_XDEBUG_SESSION_START) { set $php_upstream 127.0.0.1:${PHP_XDEBUG_PORT}; }
    if ($arg_XDEBUG_TRIGGER) { set $php_upstream 127.0.0.1:${PHP_XDEBUG_PORT}; }
    fastcgi_pass $php_upstream;`
      : `fastcgi_pass 127.0.0.1:${phpPort};`;
  return `
  location ~ \\.php$ {
    ${bodyLimit}
    ${passBlock}
    fastcgi_index index.php;
    fastcgi_connect_timeout ${opts.fastcgi_connect_timeout};
    fastcgi_send_timeout ${opts.fastcgi_send_timeout};
    fastcgi_read_timeout ${opts.fastcgi_read_timeout};
    fastcgi_buffer_size 128k;
    fastcgi_buffers 8 128k;
    fastcgi_busy_buffers_size 256k;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    include ${fastcgiParamsInclude(config)};
  }`.trim();
}

/** `try_files` line for the `location /` block, by rewrite template. */
export function rewriteTryFiles(site: Site): string {
  const template = site.rewrite ?? (site.framework === 'wordpress' ? 'wordpress' : 'laravel');
  switch (template) {
    case 'wordpress':
      return 'try_files $uri $uri/ /index.php?$args;';
    case 'static':
      return 'try_files $uri $uri/ =404;';
    case 'spa':
      return 'try_files $uri $uri/ /index.html;';
    case 'laravel':
    default:
      return 'try_files $uri $uri/ /index.php?$query_string;';
  }
}

function serverBlock(
  site: Site,
  config: DevConfig,
  sslCert: string,
  leafKey: string,
  phpPort: number,
  xdebug: boolean,
): string {
  const docRoot = nginxPathLiteral(site.doc_root);
  const accessLog = nginxPathLiteral(path.join(getLogsDir(), 'sites', site.name, 'access.log'));
  const errorLog = nginxPathLiteral(path.join(getLogsDir(), 'sites', site.name, 'error.log'));
  const reverbBlock =
    site.reverb?.enabled && site.reverb.port
      ? `${reverbProxyLocations(site.reverb.port)}\n\n  `
      : '';
  // Advanced: user-supplied raw directives (custom rewrites, headers, locations).
  const extra = site.nginx_extra?.trim() ? `\n  ${site.nginx_extra.trim()}\n` : '';

  // Node/React/Next.js sites are reverse-proxied to their dev server. With the
  // dev server off, fall back to serving built static output (SPA-style).
  let body: string;
  if (isNodeFramework(site.framework)) {
    const devPort = site.dev_server?.enabled ? site.dev_server.port : undefined;
    body = devPort
      ? devServerProxyLocation(config, devPort)
      : `location / {
    ${clientMaxBodySizeDirective(config)}
    try_files $uri $uri/ /index.html;
  }`.trim();
  } else {
    body = `${reverbBlock}location / {
    ${clientMaxBodySizeDirective(config)}
    ${rewriteTryFiles(site)}
  }

  ${fastcgiPhpLocation(config, phpPort, xdebug)}`.trim();
  }

  return `
server {
  ${listenDirectives(config)}
  server_name ${serverNames(site)};

  ${clientMaxBodySizeDirective(config)}
  root ${docRoot};
  index index.php index.html;

  ssl_certificate     ${nginxPathLiteral(sslCert)};
  ssl_certificate_key ${nginxPathLiteral(leafKey)};

  access_log ${accessLog};
  error_log  ${errorLog};
${extra}
  ${body}
}
`.trim();
}

function phpMyAdminBlock(config: DevConfig, sslCert: string, leafKey: string): string | null {
  const pma = config.services.phpmyadmin;
  if (!pma.enabled || !pma.path) return null;

  const docRoot = nginxPathLiteral(pma.path);
  const hostname = pma.hostname || 'phpmyadmin.test';
  const accessLog = nginxPathLiteral(path.join(getLogsDir(), 'sites', 'phpmyadmin', 'access.log'));
  const errorLog = nginxPathLiteral(path.join(getLogsDir(), 'sites', 'phpmyadmin', 'error.log'));

  return `
server {
  ${listenDirectives(config)}
  server_name ${nginxServerName(hostname)};

  ${clientMaxBodySizeDirective(config)}
  root ${docRoot};
  index index.php index.html;

  ssl_certificate     ${nginxPathLiteral(sslCert)};
  ssl_certificate_key ${nginxPathLiteral(leafKey)};

  access_log ${accessLog};
  error_log  ${errorLog};

  location / {
    ${clientMaxBodySizeDirective(config)}
    try_files $uri $uri/ /index.php?$query_string;
  }

  ${fastcgiPhpLocation(config, PHP_FASTCGI_PORT)}
}
`.trim();
}

/** Absolute path to the generated Stacklet dashboard docroot. */
export function dashboardDocRoot(): string {
  return path.join(getGeneratedDir(), 'dashboard');
}

/**
 * The catch-all server for http://127.0.0.1/ (and any unmatched host). Serves
 * either a user-chosen site's docroot, or the generated Stacklet dashboard.
 * Marked `default_server` so it wins for hostnames no named vhost claims.
 */
function defaultServerBlock(
  config: DevConfig,
  sites: Site[],
  sslCert: string,
  leafKey: string,
  phpPort: (site: Site) => number,
  xdebug: boolean,
): string {
  const chosenName = config.general.default_site?.trim();
  const chosen = chosenName
    ? sites.find((s) => s.name === chosenName && s.enabled !== false)
    : undefined;
  const docRoot = nginxPathLiteral(chosen ? chosen.doc_root : dashboardDocRoot());
  const port = chosen ? phpPort(chosen) : PHP_FASTCGI_PORT;
  const logName = chosen ? chosen.name : 'default';
  const accessLog = nginxPathLiteral(path.join(getLogsDir(), 'sites', logName, 'access.log'));
  const errorLog = nginxPathLiteral(path.join(getLogsDir(), 'sites', logName, 'error.log'));

  return `
server {
  ${listenDirectives(config, true)}
  server_name 127.0.0.1 localhost _;

  ${clientMaxBodySizeDirective(config)}
  root ${docRoot};
  index index.php index.html;

  ssl_certificate     ${nginxPathLiteral(sslCert)};
  ssl_certificate_key ${nginxPathLiteral(leafKey)};

  access_log ${accessLog};
  error_log  ${errorLog};

  location / {
    ${clientMaxBodySizeDirective(config)}
    try_files $uri $uri/ /index.php?$query_string;
  }

  ${fastcgiPhpLocation(config, port, xdebug)}
}
`.trim();
}

export function renderNginxVhosts(
  config: DevConfig,
  sites: Site[],
  phpPort: (site: Site) => number = () => PHP_FASTCGI_PORT,
  xdebug = false,
): string {
  const sslCert = getFullChainCertPath();
  const leafKey = getLeafKeyPath();
  const includePath = path
    .join(getGeneratedDir(), 'nginx', 'stacklet-sites.conf')
    .replace(/\\/g, '/');
  const header = `# Generated by Stacklet — include from nginx.conf:
#   include "${includePath}";
`;

  const blocks: string[] = [];
  blocks.push(defaultServerBlock(config, sites, sslCert, leafKey, phpPort, xdebug));
  const pma = phpMyAdminBlock(config, sslCert, leafKey);
  if (pma) blocks.push(pma);
  const activeSites = sites.filter((s) => s.enabled !== false);
  blocks.push(
    ...activeSites.map((s) => serverBlock(s, config, sslCert, leafKey, phpPort(s), xdebug)),
  );

  if (blocks.length === 0) {
    return `${header}\n# No registered sites\n`;
  }

  return header + '\n\n' + blocks.join('\n\n');
}
