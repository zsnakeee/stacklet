/** Field metadata for settings forms — mirrors the definitions in the old app.js. */
export interface QuickField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'checkbox' | 'select';
  options?: { value: string; label: string }[];
}

/** Dashboard runtime rows: bundled service id -> runtime process name. */
export const RUNTIME_ROWS = [
  { bundledId: 'nginx', runtime: 'nginx' },
  { bundledId: 'php', runtime: 'php-fpm' },
  { bundledId: 'mysql', runtime: 'mysql' },
  { bundledId: 'postgres', runtime: 'postgres' },
  { bundledId: 'redis', runtime: 'redis' },
  { bundledId: 'mailpit', runtime: 'mailpit' },
  { bundledId: 'mongodb', runtime: 'mongodb' },
] as const;

/** Web inbox port for Mailpit (matches config default mailpit.ui_port). */
export const MAILPIT_UI_PORT = 8025;

export const BUNDLED_RUNTIME: Record<string, string> = Object.fromEntries(
  RUNTIME_ROWS.map((r) => [r.bundledId, r.runtime]),
);

export const SETTINGS_SERVICES = [
  { key: 'nginx', label: 'Nginx' },
  { key: 'php', label: 'PHP-FPM' },
  { key: 'mysql', label: 'MySQL' },
  { key: 'postgres', label: 'PostgreSQL' },
  { key: 'redis', label: 'Redis' },
  { key: 'nodejs', label: 'Node.js' },
  { key: 'phpmyadmin', label: 'phpMyAdmin' },
] as const;

export const PHP_QUICK_FIELDS: QuickField[] = [
  { key: 'memory_limit', label: 'Memory limit' },
  { key: 'upload_max_filesize', label: 'Upload max' },
  { key: 'post_max_size', label: 'Post max' },
  { key: 'max_execution_time', label: 'Max execution (s)' },
  { key: 'max_input_time', label: 'Max input (s)' },
  { key: 'display_errors', label: 'Display errors' },
  { key: 'error_reporting', label: 'Error reporting' },
  { key: 'date.timezone', label: 'Timezone' },
];

export const NGINX_QUICK_FIELDS: QuickField[] = [
  { key: 'port', label: 'HTTP port', type: 'number' },
  { key: 'ssl_port', label: 'HTTPS port', type: 'number' },
  { key: 'client_max_body_size', label: 'Max body size' },
  { key: 'keepalive_timeout', label: 'Keepalive (s)', type: 'number' },
  { key: 'server_names_hash_bucket_size', label: 'Server names hash bucket', type: 'number' },
  { key: 'fastcgi_connect_timeout', label: 'FastCGI connect timeout' },
  { key: 'fastcgi_read_timeout', label: 'FastCGI read timeout' },
  { key: 'gzip', label: 'Gzip', type: 'checkbox' },
  { key: 'sendfile', label: 'Sendfile', type: 'checkbox' },
];

export const PMA_QUICK_FIELDS: QuickField[] = [
  { key: 'hostname', label: 'Site hostname' },
  { key: 'mysql_host', label: 'MySQL host' },
  { key: 'mysql_port', label: 'MySQL port', type: 'number' },
  {
    key: 'auth_type',
    label: 'Auth type',
    type: 'select',
    options: [
      { value: 'cookie', label: 'cookie (login form)' },
      { value: 'config', label: 'config (auto login)' },
    ],
  },
  { key: 'allow_no_password', label: 'Allow empty MySQL password', type: 'checkbox' },
  { key: 'mysql_user', label: 'MySQL user (config auth)' },
  { key: 'mysql_password', label: 'MySQL password (config auth)' },
  { key: 'max_size', label: 'Max upload size' },
  { key: 'memory_limit', label: 'Memory limit' },
  { key: 'exec_time_limit', label: 'Max execution (s)', type: 'number' },
  { key: 'login_cookie_validity', label: 'Login cookie (min)', type: 'number' },
  { key: 'default_lang', label: 'Default language' },
];

export const MYSQL_QUICK_FIELDS: QuickField[] = [
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'max_connections', label: 'Max connections', type: 'number' },
  { key: 'innodb_buffer_pool_size', label: 'InnoDB buffer pool' },
  { key: 'max_allowed_packet', label: 'Max allowed packet' },
  { key: 'character_set_server', label: 'Character set' },
  { key: 'collation_server', label: 'Collation' },
  { key: 'sql_mode', label: 'SQL mode' },
  { key: 'long_query_time', label: 'Slow query time (s)', type: 'number' },
  { key: 'slow_query_log', label: 'Slow query log', type: 'checkbox' },
  { key: 'general_log', label: 'General log', type: 'checkbox' },
];

/** Logs page: kinds shown (service logs only — per-site logs live on the site page). */
export const LOG_PAGE_KIND_ORDER = ['nginx', 'apache', 'php', 'mysql', 'postgres', 'redis'];
export const LOG_PAGE_EXCLUDED_KINDS = new Set(['site', 'laravel']);
export const LOG_KIND_LABELS: Record<string, string> = {
  nginx: 'Nginx',
  apache: 'Apache',
  php: 'PHP',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  redis: 'Redis',
};
