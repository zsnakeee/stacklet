export type WebServer = 'nginx';

/** Nginx http / fastcgi tuning (devmgr-http.conf + vhost generation). */
export interface NginxOptions {
  client_max_body_size: string;
  keepalive_timeout: number;
  gzip: boolean;
  sendfile: boolean;
  server_names_hash_bucket_size: number;
  fastcgi_connect_timeout: string;
  fastcgi_send_timeout: string;
  fastcgi_read_timeout: string;
}

export interface NginxServiceConfig {
  enabled: boolean;
  binary: string;
  config: string;
  prefix: string;
  port: number;
  ssl_port: number;
  options?: Partial<NginxOptions>;
  installed_version?: string;
}

export interface PhpServiceConfig {
  enabled: boolean;
  version: string;
  fpm_binary: string;
  php_binary: string;
  installed_version?: string;
}

/** Common MariaDB [mysqld] options (stored in config.toml, written to my.ini). */
export interface MysqlIniOptions {
  max_connections: number;
  innodb_buffer_pool_size: string;
  max_allowed_packet: string;
  character_set_server: string;
  collation_server: string;
  sql_mode: string;
  slow_query_log: boolean;
  long_query_time: number;
  general_log: boolean;
}

export interface MysqlServiceConfig {
  enabled: boolean;
  binary: string;
  port: number;
  data_dir: string;
  /** MariaDB tuning; merged with defaults and applied to my.ini on start/save. */
  options?: Partial<MysqlIniOptions>;
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

/** phpMyAdmin config.inc.php + dev-mgr site hostname. */
export interface PhpMyAdminOptions {
  mysql_host: string;
  mysql_port: number;
  auth_type: 'cookie' | 'config';
  allow_no_password: boolean;
  mysql_user: string;
  mysql_password: string;
  max_size: string;
  memory_limit: string;
  exec_time_limit: number;
  login_cookie_validity: number;
  default_lang: string;
}

export interface PhpMyAdminServiceConfig {
  enabled: boolean;
  path: string;
  hostname: string;
  options?: Partial<PhpMyAdminOptions>;
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

/** Per-site Laravel Reverb (WebSocket) settings. */
export interface SiteReverbConfig {
  enabled?: boolean;
  port?: number;
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
  reverb?: SiteReverbConfig;
}
