import fs from 'fs';
import path from 'path';
import type { DevConfig } from '../config/types';
import { ensureDir } from '../shared/paths';
import { nginxPathsFromInstallRoot, resolveNginxInstallRoot } from './nginx-paths';
import { ensureRedisConfig } from './redis-configure';
import type { BundledServiceId, ServicesManifest } from './types';

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

/** Point config.toml service binaries at bundled install paths. */
export function applyManifestToConfig(
  config: DevConfig,
  manifest: ServicesManifest,
): DevConfig {
  const next = structuredClone(config);

  if (manifest.nginx) {
    const installRoot = resolveNginxInstallRoot(
      manifest.nginx.version,
      manifest.nginx.path,
    );
    const paths = nginxPathsFromInstallRoot(installRoot);
    if (paths) {
      next.services.nginx.binary = paths.binary;
      next.services.nginx.prefix = paths.prefix;
      next.services.nginx.config = paths.config;
      next.services.nginx.installed_version = manifest.nginx.version;
    }
  }

  if (manifest.php) {
    const root = manifest.php.path;
    const phpExe = path.join(root, 'php.exe');
    const cgi = path.join(root, 'php-cgi.exe');
    if (exists(phpExe)) {
      next.services.php.php_binary = phpExe;
      next.services.php.fpm_binary = exists(cgi) ? cgi : phpExe;
      next.services.php.version = manifest.php.version;
      next.services.php.installed_version = manifest.php.version;
    }
  }

  if (manifest.mysql) {
    const root = manifest.mysql.path;
    const mysqld = findFile(root, 'mysqld.exe');
    const dataDir = path.join(root, 'data');
    if (mysqld) {
      next.services.mysql.binary = mysqld;
      next.services.mysql.installed_version = manifest.mysql.version;
      if (!exists(dataDir)) ensureDir(dataDir);
      next.services.mysql.data_dir = dataDir;
    }
  }

  if (manifest.postgres) {
    const root = manifest.postgres.path;
    const pgCtl = findFile(root, 'pg_ctl.exe');
    const dataDir = path.join(root, 'data');
    if (pgCtl) {
      next.services.postgres.binary = pgCtl;
      next.services.postgres.data_dir = exists(dataDir) ? dataDir : path.join(root, 'data');
      next.services.postgres.installed_version = manifest.postgres.version;
      if (!exists(next.services.postgres.data_dir)) {
        ensureDir(next.services.postgres.data_dir);
      }
    }
  }

  if (manifest.nodejs) {
    const root = manifest.nodejs.path;
    const nodeExe = findFile(root, 'node.exe');
    if (nodeExe) {
      next.services.nodejs.binary = nodeExe;
      next.services.nodejs.installed_version = manifest.nodejs.version;
    }
  }

  if (manifest.redis) {
    const root = manifest.redis.path;
    const redisExe = findFile(root, 'redis-server.exe');
    if (redisExe) {
      const installRoot = path.dirname(redisExe);
      next.services.redis.binary = redisExe;
      next.services.redis.config = ensureRedisConfig(installRoot, next.services.redis.port);
      next.services.redis.installed_version = manifest.redis.version;
    }
  }

  if (manifest.phpmyadmin) {
    const root = manifest.phpmyadmin.path;
    const indexPhp = findFile(root, 'index.php');
    if (indexPhp) {
      next.services.phpmyadmin.path = path.dirname(indexPhp);
      next.services.phpmyadmin.installed_version = manifest.phpmyadmin.version;
    } else if (exists(root)) {
      next.services.phpmyadmin.path = root;
      next.services.phpmyadmin.installed_version = manifest.phpmyadmin.version;
    }
  }

  if (manifest.apache) {
    const root = manifest.apache.path;
    const httpd = findFile(root, 'httpd.exe');
    if (httpd) {
      const serverRoot = path.dirname(path.dirname(httpd));
      next.services.apache.binary = httpd;
      next.services.apache.server_root = serverRoot;
      next.services.apache.config = path.join(serverRoot, 'conf', 'httpd.conf');
      next.services.apache.installed_version = manifest.apache.version;
    }
  }

  if (manifest.mailpit) {
    const root = manifest.mailpit.path;
    const mailpitExe = findFile(root, 'mailpit.exe');
    if (mailpitExe) {
      next.services.mailpit.binary = mailpitExe;
      next.services.mailpit.installed_version = manifest.mailpit.version;
    }
  }

  if (manifest.mongodb) {
    const root = manifest.mongodb.path;
    const mongod = findFile(root, 'mongod.exe');
    const dataDir = path.join(root, 'data');
    if (mongod) {
      next.services.mongodb.binary = mongod;
      next.services.mongodb.installed_version = manifest.mongodb.version;
      if (!exists(dataDir)) ensureDir(dataDir);
      next.services.mongodb.data_dir = dataDir;
    }
  }

  if (manifest.python) {
    const root = manifest.python.path;
    const pythonExe = findFile(root, 'python.exe');
    if (pythonExe) {
      next.services.python.binary = pythonExe;
      next.services.python.installed_version = manifest.python.version;
    }
  }

  return next;
}

export function clearServiceFromConfig(
  config: DevConfig,
  id: BundledServiceId,
): DevConfig {
  const next = structuredClone(config);

  switch (id) {
    case 'nginx':
      next.services.nginx.binary = '';
      next.services.nginx.config = '';
      next.services.nginx.prefix = '';
      delete next.services.nginx.installed_version;
      break;
    case 'apache':
      next.services.apache.binary = '';
      next.services.apache.config = '';
      next.services.apache.server_root = '';
      delete next.services.apache.installed_version;
      break;
    case 'php':
      next.services.php.php_binary = '';
      next.services.php.fpm_binary = '';
      delete next.services.php.installed_version;
      break;
    case 'mysql':
      next.services.mysql.binary = '';
      next.services.mysql.data_dir = '';
      delete next.services.mysql.installed_version;
      break;
    case 'postgres':
      next.services.postgres.binary = '';
      next.services.postgres.data_dir = '';
      delete next.services.postgres.installed_version;
      break;
    case 'nodejs':
      next.services.nodejs.binary = '';
      delete next.services.nodejs.installed_version;
      break;
    case 'redis':
      next.services.redis.binary = '';
      next.services.redis.config = '';
      delete next.services.redis.installed_version;
      break;
    case 'phpmyadmin':
      next.services.phpmyadmin.path = '';
      delete next.services.phpmyadmin.installed_version;
      break;
    case 'mailpit':
      next.services.mailpit.binary = '';
      delete next.services.mailpit.installed_version;
      break;
    case 'mongodb':
      next.services.mongodb.binary = '';
      next.services.mongodb.data_dir = '';
      delete next.services.mongodb.installed_version;
      break;
    case 'python':
      next.services.python.binary = '';
      delete next.services.python.installed_version;
      break;
  }

  return next;
}
