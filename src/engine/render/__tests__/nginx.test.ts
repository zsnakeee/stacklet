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
    // The catch-all default server (http://127.0.0.1/) is always present, even
    // when no named sites are enabled.
    expect(conf).toContain('default_server');
    expect(conf).toContain('server_name 127.0.0.1 localhost _;');
  });

  it('adds Reverb WebSocket proxy blocks when enabled', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'shop',
        hostname: 'shop.test',
        root: 'C:/sites/shop',
        doc_root: 'C:/sites/shop/public',
        framework: 'laravel',
        reverb: { enabled: true, port: 8080 },
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).toContain('location /app {');
    expect(conf).toContain('location /apps {');
    expect(conf).toContain('proxy_pass http://127.0.0.1:8080;');
    expect(conf).toContain('proxy_set_header Upgrade $http_upgrade;');
  });

  it('omits Reverb proxy blocks when disabled', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'shop',
        hostname: 'shop.test',
        root: 'C:/sites/shop',
        doc_root: 'C:/sites/shop/public',
        framework: 'laravel',
        reverb: { enabled: false, port: 8080 },
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).not.toContain('location /app {');
    expect(conf).not.toContain('proxy_pass http://127.0.0.1:8080;');
  });
});
