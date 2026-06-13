import i18n from './i18n';

/**
 * The engine (main process) emits some user-facing strings in English — service
 * catalog descriptions and status warnings. They can't use react-i18next, so we
 * map the known English strings to i18n keys here and translate them at the
 * display points in the renderer. Unknown strings pass through unchanged.
 */
const KEY_BY_TEXT: Record<string, string> = {
  // Service catalog descriptions (src/bundled/catalog-meta.ts)
  'Primary web server with SSL vhosts': 'engine.desc.nginx',
  'Alternative web server (httpd) — switchable with nginx': 'engine.desc.apache',
  'PHP 7.4 – latest (NTS x64, windows.php.net)': 'engine.desc.php',
  'MySQL-compatible database': 'engine.desc.mysql',
  'PostgreSQL database server': 'engine.desc.postgres',
  'JavaScript runtime (nodejs.org)': 'engine.desc.nodejs',
  'In-memory cache and queues': 'engine.desc.redis',
  'Web UI for MySQL/MariaDB (requires PHP + Nginx)': 'engine.desc.phpmyadmin',
  'Local mail catcher — SMTP server + web inbox for app emails': 'engine.desc.mailpit',
  'NoSQL document database server': 'engine.desc.mongodb',
  'Python interpreter (embeddable, for tooling/scripts)': 'engine.desc.python',
  // Status warnings (src/engine/orchestrator.ts)
  'HTTPS is not trusted yet. Open Settings → HTTPS and click “Trust SSL certificate” (UAC prompt), then restart your browser.':
    'engine.warn.httpsNotTrusted',
};

/** Translate a known engine string to the active language; pass through if unknown. */
export function tEngine(text: string | undefined | null): string {
  if (!text) return '';
  const key = KEY_BY_TEXT[text.trim()];
  return key ? i18n.t(key) : text;
}
