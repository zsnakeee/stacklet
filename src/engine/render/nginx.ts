import path from 'path';
import { mergeNginxOptions } from '../../bundled/nginx-configure';
import type { DevConfig, Site } from '../../config/types';
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

function listenDirectives(config: DevConfig): string {
  const httpPort = config.services.nginx.port;
  const sslPort = config.services.nginx.ssl_port;
  return `listen ${httpPort};\n  listen ${sslPort} ssl;`;
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

  location / {
    ${clientMaxBodySizeDirective(config)}
    try_files $uri $uri/ /index.php?$query_string;
  }

  ${fastcgiPhpLocation(config, phpPort, xdebug)}
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

export function renderNginxVhosts(
  config: DevConfig,
  sites: Site[],
  phpPort: (site: Site) => number = () => PHP_FASTCGI_PORT,
  xdebug = false,
): string {
  const sslCert = getFullChainCertPath();
  const leafKey = getLeafKeyPath();
  const includePath = path
    .join(getGeneratedDir(), 'nginx', 'devmgr-sites.conf')
    .replace(/\\/g, '/');
  const header = `# Generated by dev-mgr — include from nginx.conf:
#   include "${includePath}";
`;

  const blocks: string[] = [];
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
