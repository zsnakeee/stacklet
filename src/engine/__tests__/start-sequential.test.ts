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

  it('ignores unknown service names', () => {
    expect(orderServicesForSequentialStart(['unknown', 'nginx'])).toEqual(['nginx']);
  });
});
