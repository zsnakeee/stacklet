import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/mysql', () => ({
  findPidListeningOnPort: () => undefined,
}));
import {
  assertHostnamesAvailable,
  mergeSitePatch,
  normalizeAliases,
  recordHostnames,
  validateHostname,
} from '../site-config';
import type { RegisteredSite } from '../sites-registry';

describe('validateHostname', () => {
  it('lowercases and accepts valid hostnames', () => {
    expect(validateHostname('Shop.Test')).toBe('shop.test');
    expect(validateHostname('www.my-app.test')).toBe('www.my-app.test');
  });
  it('rejects empty and malformed hostnames', () => {
    expect(() => validateHostname('   ')).toThrow();
    expect(() => validateHostname('bad host')).toThrow();
    expect(() => validateHostname('-bad.test')).toThrow();
    expect(() => validateHostname('bad_.test')).toThrow();
  });
});

describe('normalizeAliases', () => {
  it('trims, lowercases, dedupes, drops empties', () => {
    expect(normalizeAliases([' A.test ', 'a.test', '', 'B.test'])).toEqual([
      'a.test',
      'b.test',
    ]);
  });
  it('returns [] for undefined', () => {
    expect(normalizeAliases(undefined)).toEqual([]);
  });
});

describe('recordHostnames', () => {
  it('combines effective hostname and aliases', () => {
    const rec: RegisteredSite = {
      name: 'myapp',
      root: '/x',
      aliases: ['www.myapp.test'],
    };
    expect(recordHostnames(rec)).toEqual(['myapp.test', 'www.myapp.test']);
  });
  it('uses custom domain as the primary', () => {
    const rec: RegisteredSite = { name: 'myapp', root: '/x', domain: 'shop.test' };
    expect(recordHostnames(rec)).toEqual(['shop.test']);
  });
});

describe('assertHostnamesAvailable', () => {
  const records: RegisteredSite[] = [
    { name: 'a', root: '/a' },
    { name: 'b', root: '/b', domain: 'shop.test', aliases: ['www.shop.test'] },
  ];
  it('throws when a hostname belongs to another site', () => {
    expect(() => assertHostnamesAvailable(records, 'a', ['shop.test'])).toThrow(
      /already used by site "b"/,
    );
  });
  it('ignores the site itself', () => {
    expect(() => assertHostnamesAvailable(records, 'b', ['shop.test'])).not.toThrow();
  });
  it('allows free hostnames', () => {
    expect(() => assertHostnamesAvailable(records, 'a', ['a.test'])).not.toThrow();
  });
});

describe('mergeSitePatch', () => {
  const base: RegisteredSite = { name: 'a', root: '/a' };
  it('sets and clears a custom domain', () => {
    expect(mergeSitePatch(base, { domain: 'Shop.test' }).domain).toBe('shop.test');
    expect(mergeSitePatch({ ...base, domain: 'shop.test' }, { domain: '' }).domain).toBeUndefined();
  });
  it('normalizes aliases and validates them', () => {
    expect(mergeSitePatch(base, { aliases: ['WWW.a.test'] }).aliases).toEqual(['www.a.test']);
    expect(() => mergeSitePatch(base, { aliases: ['bad host'] })).toThrow();
  });
  it('sets booleans', () => {
    expect(mergeSitePatch(base, { enabled: false }).enabled).toBe(false);
    expect(mergeSitePatch(base, { favorite: true }).favorite).toBe(true);
  });

  it('enables reverb with auto-assigned port', () => {
    const next = mergeSitePatch(base, { reverb: { enabled: true } }, [base]);
    expect(next.reverb?.enabled).toBe(true);
    expect(next.reverb?.port).toBe(8080);
  });
});
