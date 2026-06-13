import { describe, expect, it } from 'vitest';
import { LEAF_CN, BRAND } from '../../shared/brand';
import { collectTlsSanNames } from '../tls';
import type { DevConfig, Site } from '../../config/types';

const config = {
  services: { phpmyadmin: { enabled: false, hostname: '', path: '' } },
} as unknown as DevConfig;

const site = (over: Partial<Site>): Site => ({
  name: 'a',
  hostname: 'a.test',
  root: '/a',
  doc_root: '/a',
  framework: 'generic',
  enabled: true,
  ...over,
});

describe('collectTlsSanNames', () => {
  it('always includes wildcard and apex', () => {
    expect(collectTlsSanNames(config, [])).toEqual(
      ['*.test', BRAND.legacyLeafCommonName, LEAF_CN, 'test'].sort(),
    );
  });
  it('includes site hostname and aliases', () => {
    const names = collectTlsSanNames(config, [site({ aliases: ['www.a.test'] })]);
    expect(names).toContain('a.test');
    expect(names).toContain('www.a.test');
  });
  it('excludes disabled sites', () => {
    const names = collectTlsSanNames(config, [
      site({ name: 'off', hostname: 'off.test', enabled: false }),
    ]);
    expect(names).not.toContain('off.test');
  });
});
