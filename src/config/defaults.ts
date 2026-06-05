import { defaultMysqlIniOptions } from '../bundled/mysql-configure';
import { defaultNginxOptions } from '../bundled/nginx-configure';
import { defaultPhpMyAdminOptions } from '../bundled/phpmyadmin-configure';
import type { DevConfig } from './types';

export function defaultConfig(): DevConfig {
  return {
    version: 1,
    general: {
      web_server: 'nginx',
      park_path: '',
      path_in_env: true,
      path_env_selected: [],
    },
    services: {
      nginx: {
        enabled: true,
        binary: '',
        config: '',
        prefix: '',
        port: 80,
        ssl_port: 443,
        options: defaultNginxOptions(),
      },
      php: {
        enabled: true,
        version: '8.5.6',
        fpm_binary: '',
        php_binary: '',
      },
      mysql: {
        enabled: true,
        binary: '',
        port: 3306,
        data_dir: '',
        options: defaultMysqlIniOptions(),
      },
      postgres: {
        enabled: true,
        binary: '',
        port: 5432,
        data_dir: '',
      },
      nodejs: {
        enabled: true,
        binary: '',
      },
      redis: {
        enabled: true,
        binary: '',
        config: '',
        port: 6379,
      },
      phpmyadmin: {
        enabled: true,
        path: '',
        hostname: 'phpmyadmin.test',
        options: defaultPhpMyAdminOptions(3306),
      },
    },
  };
}
