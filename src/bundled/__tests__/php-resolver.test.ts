import { describe, expect, it } from 'vitest';
import { PHP_STATIC_VERSIONS } from '../resolvers/php-static';
import { compareVersions, gteVersion } from '../resolvers/semver';

describe('PHP static versions', () => {
  it('includes 7.4 through 8.5', () => {
    const versions = PHP_STATIC_VERSIONS.map((v) => v.version);
    expect(versions).toContain('7.4.33');
    expect(versions).toContain('8.0.30');
    expect(versions).toContain('8.5.6');
    expect(gteVersion(versions[0], versions[versions.length - 1])).toBe(true);
  });

  it('has valid download URLs', () => {
    for (const entry of PHP_STATIC_VERSIONS) {
      expect(entry.url).toMatch(/^https:\/\/windows\.php\.net\/downloads\/releases\/php-.*\.zip$/);
      expect(entry.url).toContain('nts');
    }
  });
});

describe('PHP version filtering', () => {
  it('includes 7.4+ milestones', () => {
    expect(gteVersion('7.4.33', '7.4.0')).toBe(true);
    expect(gteVersion('8.5.6', '7.4.0')).toBe(true);
    expect(gteVersion('7.3.33', '7.4.0')).toBe(false);
  });

  it('sorts versions correctly', () => {
    expect(compareVersions('8.5.6', '7.4.33')).toBeGreaterThan(0);
    expect(compareVersions('8.1.34', '8.0.30')).toBeGreaterThan(0);
  });
});
