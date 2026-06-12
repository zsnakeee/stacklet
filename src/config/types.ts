export type WebServer = 'nginx' | 'apache';

/** Nginx http / fastcgi tuning (stacklet-http.conf + vhost generation). */
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

export interface ApacheServiceConfig {
  enabled: boolean;
  binary: string;
  /** httpd.conf path. */
  config: string;
  /** ServerRoot (the Apache install dir). */
  server_root: string;
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

export interface MailpitServiceConfig {
  enabled: boolean;
  binary: string;
  /** SMTP port apps send to (MAIL_PORT). */
  port: number;
  /** Web inbox port. */
  ui_port: number;
  installed_version?: string;
}

export interface MongodbServiceConfig {
  enabled: boolean;
  binary: string;
  port: number;
  data_dir: string;
  installed_version?: string;
}

export interface PythonServiceConfig {
  enabled: boolean;
  binary: string;
  installed_version?: string;
}

export interface DevConfig {
  version: number;
  general: {
    web_server: WebServer;
    park_path: string;
    /** Local TLD for site hostnames (default "test"). */
    tld?: string;
    /** @deprecated Use path_env_selected. If true and path_env_selected unset, all candidates are selected. */
    path_in_env?: boolean;
    /** IDs from listEnvPathCandidates to prepend to the Windows user PATH. */
    path_env_selected?: string[];
    /** Start the app hidden to the tray. */
    start_minimized?: boolean;
    /** Start the window maximized. */
    start_maximized?: boolean;
    /** Auto-start enabled services when the app launches (default true). */
    autostart?: boolean;
    /** Launch Stacklet automatically at Windows login. */
    launch_on_login?: boolean;
    /** Route Xdebug-triggered requests to a dedicated Xdebug-enabled php-cgi. */
    xdebug?: boolean;
  };
  services: {
    nginx: NginxServiceConfig;
    apache: ApacheServiceConfig;
    php: PhpServiceConfig;
    mysql: MysqlServiceConfig;
    postgres: PostgresServiceConfig;
    nodejs: NodejsServiceConfig;
    redis: RedisServiceConfig;
    phpmyadmin: PhpMyAdminServiceConfig;
    mailpit: MailpitServiceConfig;
    mongodb: MongodbServiceConfig;
    python: PythonServiceConfig;
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
  /** Isolated PHP version for this site (empty/undefined = use the default). */
  php_version?: string;
}
