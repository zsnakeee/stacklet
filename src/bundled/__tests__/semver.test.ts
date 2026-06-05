import { describe, expect, it } from 'vitest';
import { gteVersion } from '../resolvers/semver';

describe('semver', () => {
  it('filters PHP 8.5+', () => {
    expect(gteVersion('8.5.0', '8.5.0')).toBe(true);
    expect(gteVersion('8.4.1', '8.5.0')).toBe(false);
    expect(gteVersion('8.5.1', '8.5.0')).toBe(true);
  });
});
