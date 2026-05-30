export type WebServer = 'nginx';

export interface NginxServiceConfig {
  enabled: boolean;
  binary: string;
  config: string;
  prefix: string;
  port: number;
  ssl_port: number;
  installed_version?: string;
}

export interface PhpServiceConfig {
  enabled: boolean;
  version: string;
  fpm_binary: string;
  php_binary: string;
  installed_version?: string;
}

export interface MysqlServiceConfig {
  enabled: boolean;
  binary: string;
  port: number;
  data_dir: string;
  installed_version?: string;
}

export interface PostgresServiceConfig {
  enabled: boolean;
  binary: string;
  port: number;
  data_dir: string;
  installed_version?: string;
}

export interface NodejsServiceConfig {
  enabled: boolean;
  binary: string;
  installed_version?: string;
}

export interface RedisServiceConfig {
  enabled: boolean;
  binary: string;
  config: string;
  port: number;
  installed_version?: string;
}

export interface PhpMyAdminServiceConfig {
  enabled: boolean;
  path: string;
  hostname: string;
  installed_version?: string;
}

export interface DevConfig {
  version: number;
  general: {
    web_server: WebServer;
    park_path: string;
    /** @deprecated Use path_env_selected. If true and path_env_selected unset, all candidates are selected. */
    path_in_env?: boolean;
    /** IDs from listEnvPathCandidates to prepend to the Windows user PATH. */
    path_env_selected?: string[];
  };
  services: {
    nginx: NginxServiceConfig;
    php: PhpServiceConfig;
    mysql: MysqlServiceConfig;
    postgres: PostgresServiceConfig;
    nodejs: NodejsServiceConfig;
    redis: RedisServiceConfig;
    phpmyadmin: PhpMyAdminServiceConfig;
  };
}

export interface Site {
  name: string;
  hostname: string;
  root: string;
  doc_root: string;
  framework: 'laravel' | 'wordpress' | 'generic';
  /** Defaults to true when absent. */
  enabled?: boolean;
  /** Defaults to false when absent. */
  favorite?: boolean;
  /** Extra server_names beyond the primary hostname. */
  aliases?: string[];
}
