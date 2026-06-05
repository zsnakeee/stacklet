import { describe, expect, it } from 'vitest';
import { parsePhpVariantFromZipUrl } from '../php-install-meta';

describe('parsePhpVariantFromZipUrl', () => {
  it('parses nts vs17 from release URL', () => {
    const url =
      'https://windows.php.net/downloads/releases/php-8.3.14-Win32-nts-vs17-x64.zip';
    expect(parsePhpVariantFromZipUrl(url)).toBe('nts-vs17-x64');
  });

  it('parses ts vs16', () => {
    const url = 'https://example.com/php-8.2.0-ts-vs16-x64.zip';
    expect(parsePhpVariantFromZipUrl(url)).toBe('ts-vs16-x64');
  });
});
