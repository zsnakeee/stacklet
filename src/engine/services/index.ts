import path from 'path';
import type { DevConfig } from '../../config/types';
import { getLogsDir } from '../../shared/paths';
import { PHP_FASTCGI_PORT } from '../service-ports';
import { buildMysqlSpawn } from './mysql';
import { buildPostgresSpawn } from './postgres';
import { buildPhpCgiSpawn, resolvePhpCgiBinary } from './php-cgi';
import { ManagedProcess } from './process';

export {
  ManagedProcess,
  type ManagedProcessOptions,
  type ServiceState,
  type ServiceStatus,
} from './process';

export class ServiceManager {
  readonly nginx: ManagedProcess;
  readonly phpFpm: ManagedProcess;
  readonly mysql: ManagedProcess;
  readonly postgres: ManagedProcess;
  readonly redis: ManagedProcess;
  readonly nodejs: ManagedProcess;

  constructor(config: DevConfig) {
    const nginx = config.services.nginx;
    const prefix = nginx.prefix ? path.resolve(nginx.prefix) : '';
    const conf = nginx.config ? path.resolve(nginx.config) : '';
    this.nginx = new ManagedProcess(
      'nginx',
      nginx.binary,
      prefix && conf ? ['-p', prefix, '-c', conf] : [],
      path.join(prefix || '.', 'logs', 'nginx.pid'),
    );

    const phpFpmBinary = resolvePhpCgiBinary(
      config.services.php.fpm_binary,
      config.services.php.php_binary,
    );
    let phpArgs: string[] = [];
    let phpCwd: string | undefined;
    let phpSpawnEnv: Record<string, string> | undefined;
    if (phpFpmBinary) {
      try {
        const phpSpawn = buildPhpCgiSpawn(phpFpmBinary);
        phpArgs = phpSpawn.args;
        phpCwd = phpSpawn.cwd;
        phpSpawnEnv = phpSpawn.env;
      } catch {
        // start() will surface a clear error if binary is not php-cgi
      }
    }
    this.phpFpm = new ManagedProcess(
      'php-fpm',
      phpFpmBinary,
      phpArgs,
      'php-fpm.pid',
      phpCwd,
      {
        listenPort: PHP_FASTCGI_PORT,
        spawnEnv: phpSpawnEnv,
        supervise: true,
        stderrLog: path.join(getLogsDir(), 'php-cgi.stderr.log'),
      },
    );

    const mysql = config.services.mysql;
    let mysqlArgs: string[] = [];
    let mysqlCwd: string | undefined;
    if (mysql.binary && mysql.data_dir) {
      try {
        const mysqlSpawn = buildMysqlSpawn(
          mysql.binary,
          mysql.data_dir,
          mysql.port,
          mysql.options,
        );
        mysqlArgs = mysqlSpawn.args;
        mysqlCwd = mysqlSpawn.cwd;
      } catch {
        // start() surfaces configuration errors
      }
    }
    this.mysql = new ManagedProcess(
      'mysql',
      mysql.binary,
      mysqlArgs,
      'mysql.pid',
      mysqlCwd,
      { listenPort: mysql.port },
    );

    const postgres = config.services.postgres;
    let postgresArgs: string[] = [];
    let postgresCwd: string | undefined;
    if (postgres.binary && postgres.data_dir) {
      try {
        const pgSpawn = buildPostgresSpawn(
          postgres.binary,
          postgres.data_dir,
          postgres.port,
        );
        postgresArgs = pgSpawn.args;
        postgresCwd = pgSpawn.cwd;
      } catch {
        // start() surfaces configuration errors
      }
    }
    this.postgres = new ManagedProcess(
      'postgres',
      postgres.binary,
      postgresArgs,
      'postgres.pid',
      postgresCwd,
      { listenPort: postgres.port, dataDir: postgres.data_dir || undefined },
    );

    const redis = config.services.redis;
    const redisInstallRoot = redis.binary ? path.dirname(path.resolve(redis.binary)) : '';
    const redisConf = redis.config ? path.resolve(redis.config) : '';
    this.redis = new ManagedProcess(
      'redis',
      redis.binary,
      redisConf ? [redisConf] : [],
      'redis.pid',
      redisInstallRoot || undefined,
    );

    this.nodejs = new ManagedProcess(
      'nodejs',
      config.services.nodejs.binary,
      [],
      'nodejs.pid',
    );
  }

  /** Processes the engine can start/stop (Node is runtime-only). */
  startable(): ManagedProcess[] {
    return [this.nginx, this.phpFpm, this.mysql, this.postgres, this.redis];
  }

  all(): ManagedProcess[] {
    return [...this.startable(), this.nodejs];
  }
}
