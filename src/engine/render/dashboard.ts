import type { DevConfig, Site } from '../../config/types';

/** HTML-escape a string for safe interpolation into the dashboard markup. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Static landing page served at http://127.0.0.1/ when no default site is set.
 * Lists every registered site with HTTPS/HTTP links. Pure static HTML (no PHP)
 * so it renders even when no app is installed.
 */
export function renderDashboardHtml(config: DevConfig, sites: Site[]): string {
  const active = sites
    .filter((s) => s.enabled !== false)
    .sort((a, b) => a.hostname.localeCompare(b.hostname));

  const cards = active.length
    ? active
        .map((s) => {
          const host = esc(s.hostname);
          const fw = s.framework ? `<span class="tag">${esc(s.framework)}</span>` : '';
          return `<li class="card">
        <div class="row">
          <span class="host">${host}</span>
          ${fw}
        </div>
        <div class="links">
          <a href="https://${host}/">https</a>
          <a href="http://${host}/">http</a>
        </div>
      </li>`;
        })
        .join('\n      ')
    : `<li class="empty">No sites yet. Add one from the Sites tab in Stacklet.</li>`;

  const tld = esc(config.general.tld || 'test');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Stacklet</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #090c0e; color: #eaf0f6;
    display: flex; flex-direction: column; align-items: center;
    padding: 48px 20px;
  }
  .brand { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .brand span { color: #2dd4aa; }
  .sub { color: #9aa8b8; margin-top: 6px; font-size: 14px; }
  ul { list-style: none; padding: 0; margin: 32px 0 0; width: 100%; max-width: 640px;
       display: flex; flex-direction: column; gap: 10px; }
  .card {
    background: #131b24; border: 1px solid rgba(148,163,184,.16); border-radius: 12px;
    padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .row { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .host { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 11px; color: #2dd4aa; border: 1px solid rgba(45,212,170,.4);
         border-radius: 999px; padding: 1px 8px; }
  .links { display: flex; gap: 8px; flex-shrink: 0; }
  .links a { text-decoration: none; font-size: 13px; color: #eaf0f6;
             border: 1px solid rgba(148,163,184,.22); border-radius: 8px; padding: 5px 12px; }
  .links a:hover { background: #1b2530; }
  .empty { color: #9aa8b8; text-align: center; padding: 28px; border: 1px dashed rgba(148,163,184,.22);
           border-radius: 12px; }
  footer { margin-top: 28px; color: #647689; font-size: 12px; }
</style>
</head>
<body>
  <div class="brand">Stack<span>let</span></div>
  <div class="sub">Local sites on <code>.${tld}</code></div>
  <ul>
      ${cards}
  </ul>
  <footer>Served by Stacklet at this machine &middot; choose a default site in Settings &rarr; Web server.</footer>
</body>
</html>
`;
}
