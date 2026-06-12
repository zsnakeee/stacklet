import type { DevConfig } from '../config/types';

/** FastCGI port used by nginx vhosts for PHP on Windows. */
export const PHP_FASTCGI_PORT = 9000;

/** Dedicated php-cgi (active version + Xdebug) for on-demand debugging. */
export const PHP_XDEBUG_PORT = 9100;

export function getServicePortLabel(serviceName: string, config: DevConfig): string {
  switch (serviceName) {
    case 'nginx': {
      const { port, ssl_port } = config.services.nginx;
      return `${port} · SSL ${ssl_port}`;
    }
    case 'php-fpm':
      return String(PHP_FASTCGI_PORT);
    case 'mysql':
      return String(config.services.mysql.port);
    case 'postgres':
      return String(config.services.postgres.port);
    case 'redis':
      return String(config.services.redis.port);
    case 'nodejs':
      return '—';
    default:
      return '—';
  }
}
