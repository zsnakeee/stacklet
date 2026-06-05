import { describe, expect, it } from 'vitest';
import type { LogSource } from '../sources';
import { resolveServiceLogId } from '../resolve-service-log';

const sources: LogSource[] = [
  {
    id: 'site:myapp:access',
    label: 'myapp.test access.log',
    path: 'C:\\logs\\sites\\myapp\\access.log',
    kind: 'site',
  },
  {
    id: 'nginx:access',
    label: 'Nginx access.log',
    path: 'C:\\logs\\nginx\\access.log',
    kind: 'nginx',
  },
  {
    id: 'nginx:error',
    label: 'Nginx error.log',
    path: 'C:\\logs\\nginx\\error.log',
    kind: 'nginx',
  },
  {
    id: 'php:8.5.6:error',
    label: 'PHP 8.5.6 error.log',
    path: 'C:\\logs\\php\\8.5.6\\error.log',
    kind: 'php',
  },
  {
    id: 'mysql:error',
    label: 'MySQL error.log',
    path: 'C:\\logs\\mysql\\error.log',
    kind: 'mysql',
  },
];

describe('resolveServiceLogId', () => {
  it('returns service error log, not site access.log', () => {
    expect(resolveServiceLogId('nginx', sources, '8.5.6')).toBe('nginx:error');
    expect(resolveServiceLogId('mysql', sources, '8.5.6')).toBe('mysql:error');
    expect(resolveServiceLogId('php', sources, '8.5.6')).toBe('php:8.5.6:error');
  });

  it('returns null when service has no logs', () => {
    expect(resolveServiceLogId('redis', sources, '8.5.6')).toBeNull();
  });
});
