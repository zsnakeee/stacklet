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
      tld: 'test',
      path_in_env: true,
      path_env_selected: [],
      start_minimized: false,
      close_to_tray: true,
      autostart: true,
      launch_on_login: false,
      xdebug: false,
      enhanced_terminal: true,
      default_site: '',
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
      apache: {
        enabled: true,
        binary: '',
        config: '',
        server_root: '',
        port: 80,
        ssl_port: 443,
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
      mailpit: {
        enabled: true,
        binary: '',
        port: 1025,
        ui_port: 8025,
      },
      mongodb: {
        enabled: true,
        binary: '',
        port: 27017,
        data_dir: '',
      },
      python: {
        enabled: true,
        binary: '',
      },
    },
  };
}
