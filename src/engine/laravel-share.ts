import fs from 'fs';
import path from 'path';

/**
 * Make a Laravel app generate correct URLs when shared through ngrok.
 *
 * When ngrok terminates TLS and forwards to the local site, Laravel only emits
 * https + the public host in asset()/url() if it TRUSTS the reverse proxy and
 * honors X-Forwarded-* headers — otherwise it builds http://<site>.test URLs
 * that the browser blocks (mixed-content / CORS). This applies the standard
 * "trust proxies" fix automatically and idempotently:
 *
 *   - Laravel 11/12: drop an App\Providers\StackletTrustProxies provider and
 *     register it in bootstrap/providers.php.
 *   - Laravel 9/10: set $proxies = '*' (+ forwarded headers) in the app's
 *     TrustProxies middleware.
 *
 * Best-effort: returns a short note describing what changed (or why not). Never
 * throws — sharing should still work even if the app layout is unexpected.
 */
const PROVIDER_CLASS = 'StackletTrustProxies';
const PROVIDER_FQCN = `App\\Providers\\${PROVIDER_CLASS}`;

const PROVIDER_PHP = `<?php

namespace App\\Providers;

use Illuminate\\Http\\Request;
use Illuminate\\Support\\ServiceProvider;

/**
 * Added by Stacklet so shared (ngrok) URLs work: trust the local reverse proxy
 * (nginx) and honor X-Forwarded-* so asset()/url() use the public host + https.
 * Safe for local development. Delete this file (and its line in
 * bootstrap/providers.php) to opt out.
 */
class ${PROVIDER_CLASS} extends ServiceProvider
{
    public function boot(): void
    {
        Request::setTrustedProxies(
            ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
            Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO
        );
    }
}
`;

export function ensureLaravelTrustedProxies(siteRoot: string): string | null {
  try {
    const root = path.resolve(siteRoot);
    const providersListPath = path.join(root, 'bootstrap', 'providers.php');
    const trustProxiesPath = path.join(root, 'app', 'Http', 'Middleware', 'TrustProxies.php');

    // Laravel 11/12 — provider + bootstrap/providers.php registration.
    if (fs.existsSync(providersListPath)) {
      const providerDir = path.join(root, 'app', 'Providers');
      const providerFile = path.join(providerDir, `${PROVIDER_CLASS}.php`);
      if (!fs.existsSync(providerFile)) {
        fs.mkdirSync(providerDir, { recursive: true });
        fs.writeFileSync(providerFile, PROVIDER_PHP, 'utf8');
      }
      let list = fs.readFileSync(providersListPath, 'utf8');
      if (list.includes(PROVIDER_CLASS)) return null; // already registered
      // Insert into the returned array: `return [` … `];`
      const m = list.match(/return\s*\[/);
      if (!m || m.index === undefined) return null;
      const insertAt = m.index + m[0].length;
      list = `${list.slice(0, insertAt)}\n    ${PROVIDER_FQCN}::class,${list.slice(insertAt)}`;
      fs.writeFileSync(providersListPath, list, 'utf8');
      return 'Configured ngrok/HTTPS proxy trust (added StackletTrustProxies provider).';
    }

    // Laravel 9/10 — set $proxies in the app's TrustProxies middleware.
    if (fs.existsSync(trustProxiesPath)) {
      let content = fs.readFileSync(trustProxiesPath, 'utf8');
      if (/protected\s+\$proxies\s*=\s*'\*'/.test(content)) return null; // already set
      content = content.replace(
        /protected\s+\$proxies\s*=\s*[^;]*;/,
        "protected \$proxies = '*';",
      );
      // Ensure forwarded headers include HOST (Laravel's default usually does ALL).
      fs.writeFileSync(trustProxiesPath, content, 'utf8');
      return 'Configured ngrok/HTTPS proxy trust (TrustProxies $proxies = \'*\').';
    }

    return null;
  } catch {
    return null;
  }
}
