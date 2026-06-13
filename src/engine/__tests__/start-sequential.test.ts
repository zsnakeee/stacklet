import { describe, expect, it } from 'vitest';
import { orderServicesForSequentialStart } from '../orchestrator';

describe('orderServicesForSequentialStart', () => {
  it('orders services in safe start order regardless of input order', () => {
    expect(orderServicesForSequentialStart(['redis', 'nginx', 'mysql'])).toEqual([
      'nginx',
      'mysql',
      'redis',
    ]);
  });

  it('includes php-fpm between nginx and mysql', () => {
    expect(orderServicesForSequentialStart(['mysql', 'php-fpm', 'nginx'])).toEqual([
      'nginx',
      'php-fpm',
      'mysql',
    ]);
  });

  it('keeps names not in the canonical order (appended), so the web server is never dropped', () => {
    // apache resolves from the web-server slot but isn't in SERVICE_START_ORDER;
    // it must be kept, not dropped (regression: "Start all" did nothing on Apache).
    expect(orderServicesForSequentialStart(['mysql', 'apache'])).toEqual(['apache', 'mysql']);
    expect(orderServicesForSequentialStart(['unknown', 'nginx'])).toEqual(['nginx', 'unknown']);
  });

  it('starts the web server first whether nginx or apache', () => {
    expect(orderServicesForSequentialStart(['php-fpm', 'apache'])).toEqual(['apache', 'php-fpm']);
  });
});
