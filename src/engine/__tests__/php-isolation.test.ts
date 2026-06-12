import { describe, expect, it } from 'vitest';
import type { Site } from '../../config/types';
import { phpPortForVersion, requiredIsolatedVersions } from '../php-isolation';

const INSTALLED = ['8.4.1', '8.3.10', '8.2.20'];
const ACTIVE = '8.4.1';

function site(name: string, php?: string, enabled = true): Site {
  return {
    name,
    hostname: `${name}.test`,
    root: `C:/p/${name}`,
    doc_root: `C:/p/${name}/public`,
    framework: 'laravel',
    enabled,
    php_version: php,
  };
}

describe('php-isolation', () => {
  it('uses the shared 9000 port for the default/active version or no isolation', () => {
    expect(phpPortForVersion(undefined, ACTIVE, INSTALLED)).toBe(9000);
    expect(phpPortForVersion('', ACTIVE, INSTALLED)).toBe(9000);
    expect(phpPortForVersion(ACTIVE, ACTIVE, INSTALLED)).toBe(9000);
  });

  it('assigns stable dedicated ports to isolated installed versions (sorted asc)', () => {
    // isolatable (installed minus active), sorted ascending: 8.2.20, 8.3.10
    expect(phpPortForVersion('8.2.20', ACTIVE, INSTALLED)).toBe(9001);
    expect(phpPortForVersion('8.3.10', ACTIVE, INSTALLED)).toBe(9002);
  });

  it('falls back to 9000 for a version that is not installed', () => {
    expect(phpPortForVersion('7.4.0', ACTIVE, INSTALLED)).toBe(9000);
  });

  it('collects distinct isolated versions from enabled sites only', () => {
    const sites = [
      site('a', '8.3.10'),
      site('b', '8.3.10'),
      site('c', '8.2.20'),
      site('d', ACTIVE), // active = not isolated
      site('e', '8.2.20', false), // disabled = ignored
      site('f'), // default
    ];
    const req = requiredIsolatedVersions(sites, ACTIVE, INSTALLED).sort();
    expect(req).toEqual(['8.2.20', '8.3.10']);
  });
});
