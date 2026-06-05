import path from 'path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../../config/defaults';
import type { Site } from '../../../config/types';
import { nginxPathLiteral, renderNginxVhosts } from '../nginx';

describe('renderNginxVhosts', () => {
  it('quotes doc_root paths that contain spaces', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'my app',
        hostname: 'my-app.test',
        root: 'C:/park/my app',
        doc_root: 'C:/park/my app/public',
        framework: 'laravel',
      },
    ];

    const conf = renderNginxVhosts(config, sites);
    expect(conf).toContain('root "C:/park/my app/public";');
    expect(conf).not.toMatch(/root C:\/park\/my app/);
    expect(conf).toContain('server_name my-app.test;');
    expect(conf).toContain('fullchain.crt');
  });

  it('quotes server_name when hostname contains spaces', () => {
    const config = defaultConfig();
    const sites = [
      {
        name: 'Bad',
        hostname: 'Atmel Studio.test',
        root: 'C:/park/x',
        doc_root: 'C:/park/x',
        framework: 'generic' as const,
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).toContain('server_name "Atmel Studio.test";');
  });

  it('nginxPathLiteral normalizes backslashes', () => {
    expect(nginxPathLiteral(String.raw`C:\Users\Ziad\My Sites\public`)).toBe(
      '"C:/Users/Ziad/My Sites/public"',
    );
  });

  it('emits primary hostname and aliases as server_name', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'shop',
        hostname: 'shop.test',
        root: 'C:/sites/shop',
        doc_root: 'C:/sites/shop/public',
        framework: 'laravel',
        enabled: true,
        aliases: ['www.shop.test'],
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).toContain('server_name shop.test www.shop.test;');
  });

  it('sets client_max_body_size on each server block', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'shop',
        hostname: 'shop.test',
        root: 'C:/sites/shop',
        doc_root: 'C:/sites/shop/public',
        framework: 'laravel',
        enabled: true,
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).toContain('client_max_body_size 0;');
    expect(conf).toMatch(/location \/ \{[^}]*client_max_body_size/s);
  });

  it('sets generous fastcgi timeouts for long PHP requests', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'shop',
        hostname: 'shop.test',
        root: 'C:/sites/shop',
        doc_root: 'C:/sites/shop/public',
        framework: 'laravel',
        enabled: true,
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).toContain('fastcgi_read_timeout 300s');
    expect(conf).toContain('fastcgi_send_timeout 300s');
  });

  it('omits disabled sites', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'off',
        hostname: 'off.test',
        root: 'C:/sites/off',
        doc_root: 'C:/sites/off',
        framework: 'generic',
        enabled: false,
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).not.toContain('off.test');
    expect(conf).toContain('No registered sites');
  });
});
