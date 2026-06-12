import type { BundledServiceId } from './types';

export interface ServiceMeta {
  id: BundledServiceId;
  name: string;
  description: string;
}

export const SERVICE_META: ServiceMeta[] = [
  {
    id: 'nginx',
    name: 'Nginx',
    description: 'Primary web server with SSL vhosts',
  },
  {
    id: 'php',
    name: 'PHP',
    description: 'PHP 7.4 – latest (NTS x64, windows.php.net)',
  },
  {
    id: 'mysql',
    name: 'MariaDB',
    description: 'MySQL-compatible database',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'PostgreSQL database server',
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    description: 'JavaScript runtime (nodejs.org)',
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'In-memory cache and queues',
  },
  {
    id: 'phpmyadmin',
    name: 'phpMyAdmin',
    description: 'Web UI for MySQL/MariaDB (requires PHP + Nginx)',
  },
  {
    id: 'mailpit',
    name: 'Mailpit',
    description: 'Local mail catcher — SMTP server + web inbox for app emails',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'NoSQL document database server',
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Python interpreter (embeddable, for tooling/scripts)',
  },
];
