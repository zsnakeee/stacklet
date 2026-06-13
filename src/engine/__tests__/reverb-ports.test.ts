import { describe, expect, it, vi } from 'vitest';
import {
  allocateReverbPort,
  effectiveReverbPort,
  mergeReverbPatch,
  REVERB_PORT_MAX,
  REVERB_PORT_MIN,
  resolveSiteReverb,
} from '../reverb-ports';
import type { RegisteredSite } from '../sites-registry';

vi.mock('../services/mysql', () => ({
  findPidListeningOnPort: () => undefined,
}));

describe('allocateReverbPort', () => {
  it('returns the lowest free port in range', () => {
    const records: RegisteredSite[] = [
      { name: 'a', root: '/a', reverb: { enabled: true, port: 8080 } },
    ];
    expect(allocateReverbPort(records, 'b')).toBe(8081);
  });

  it('throws when the range is exhausted', () => {
    const records: RegisteredSite[] = [];
    for (let p = REVERB_PORT_MIN; p <= REVERB_PORT_MAX; p++) {
      records.push({ name: `s${p}`, root: `/${p}`, reverb: { enabled: true, port: p } });
    }
    expect(() => allocateReverbPort(records, 'new')).toThrow(/No free Reverb port/);
  });
});

describe('mergeReverbPatch', () => {
  const records: RegisteredSite[] = [{ name: 'shop', root: '/shop' }];

  it('allocates a port when enabling without an explicit port', () => {
    const next = mergeReverbPatch(records[0], { enabled: true }, records);
    expect(next.reverb?.enabled).toBe(true);
    expect(next.reverb?.port).toBe(REVERB_PORT_MIN);
  });

  it('keeps reverb disabled without requiring a port', () => {
    const enabled = mergeReverbPatch(records[0], { enabled: true }, records);
    const next = mergeReverbPatch(enabled, { enabled: false }, records);
    expect(next.reverb?.enabled).toBe(false);
  });

  it('rejects duplicate ports across sites', () => {
    const taken: RegisteredSite[] = [
      { name: 'a', root: '/a', reverb: { enabled: true, port: 8080 } },
      { name: 'b', root: '/b' },
    ];
    expect(() =>
      mergeReverbPatch(taken[1], { enabled: true, port: 8080 }, taken),
    ).toThrow(/already used by site "a"/);
  });
});

describe('resolveSiteReverb', () => {
  it('resolves an effective port for enabled sites', () => {
    const records: RegisteredSite[] = [
      { name: 'shop', root: '/shop', reverb: { enabled: true } },
    ];
    expect(resolveSiteReverb(records[0], records)).toEqual({
      enabled: true,
      port: REVERB_PORT_MIN,
    });
    expect(effectiveReverbPort(records[0], records)).toBe(REVERB_PORT_MIN);
  });
});
