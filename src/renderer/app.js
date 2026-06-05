import { ICONS, iconBtn } from './icons.js';
import { runAction, runActionClick } from './action.js';
import { toast } from './toast.js';
import { BRAND } from './brand.js';

/** @typedef {{ name: string, state: string, message?: string, pid?: number, port?: string }} RuntimeSvc */

const DASHBOARD_POLL_MS = 4000;

const RUNTIME_ROWS = [
  { bundledId: 'nginx', runtime: 'nginx' },
  { bundledId: 'php', runtime: 'php-fpm' },
  { bundledId: 'mysql', runtime: 'mysql' },
  { bundledId: 'postgres', runtime: 'postgres' },
  { bundledId: 'redis', runtime: 'redis' },
];

/** @type {Record<string, string>} */
const BUNDLED_RUNTIME = Object.fromEntries(
  RUNTIME_ROWS.map((r) => [r.bundledId, r.runtime]),
);

const PHP_QUICK_FIELDS = [
  { key: 'memory_limit', label: 'Memory limit' },
  { key: 'upload_max_filesize', label: 'Upload max' },
  { key: 'post_max_size', label: 'Post max' },
  { key: 'max_execution_time', label: 'Max execution (s)' },
  { key: 'max_input_time', label: 'Max input (s)' },
  { key: 'display_errors', label: 'Display errors' },
  { key: 'error_reporting', label: 'Error reporting' },
  { key: 'date.timezone', label: 'Timezone' },
];

const NGINX_QUICK_FIELDS = [
  { key: 'port', label: 'HTTP port', type: 'number' },
  { key: 'ssl_port', label: 'HTTPS port', type: 'number' },
  { key: 'client_max_body_size', label: 'Max body size' },
  { key: 'keepalive_timeout', label: 'Keepalive (s)', type: 'number' },
  { key: 'server_names_hash_bucket_size', label: 'Server names hash bucket', type: 'number' },
  { key: 'fastcgi_connect_timeout', label: 'FastCGI connect timeout' },
  { key: 'fastcgi_send_timeout', label: 'FastCGI send timeout' },
  { key: 'fastcgi_read_timeout', label: 'FastCGI read timeout' },
  { key: 'gzip', label: 'Gzip', type: 'checkbox' },
  { key: 'sendfile', label: 'Sendfile', type: 'checkbox' },
];

const PMA_QUICK_FIELDS = [
  { key: 'hostname', label: 'Site hostname' },
  { key: 'mysql_host', label: 'MySQL host' },
  { key: 'mysql_port', label: 'MySQL port', type: 'number' },
  {
    key: 'auth_type',
    label: 'Auth type',
    type: 'select',
    options: [
      { value: 'cookie', label: 'cookie (login form)' },
      { value: 'config', label: 'config (auto login)' },
    ],
  },
  { key: 'allow_no_password', label: 'Allow empty MySQL password', type: 'checkbox' },
  { key: 'mysql_user', label: 'MySQL user (config auth)' },
  { key: 'mysql_password', label: 'MySQL password (config auth)' },
  { key: 'max_size', label: 'Max upload size' },
  { key: 'memory_limit', label: 'Memory limit' },
  { key: 'exec_time_limit', label: 'Max execution (s)', type: 'number' },
  { key: 'login_cookie_validity', label: 'Login cookie (min)', type: 'number' },
  { key: 'default_lang', label: 'Default language' },
];

const MYSQL_QUICK_FIELDS = [
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'max_connections', label: 'Max connections', type: 'number' },
  { key: 'innodb_buffer_pool_size', label: 'InnoDB buffer pool' },
  { key: 'max_allowed_packet', label: 'Max allowed packet' },
  { key: 'character_set_server', label: 'Character set' },
  { key: 'collation_server', label: 'Collation' },
  { key: 'sql_mode', label: 'SQL mode' },
  { key: 'long_query_time', label: 'Slow query time (s)', type: 'number' },
  { key: 'slow_query_log', label: 'Slow query log', type: 'checkbox' },
  { key: 'general_log', label: 'General log', type: 'checkbox' },
];

let state = { status: null, config: null };
let busyServiceId = null;
let detailServiceId = null;
/** @type {string | null} */
let detailSiteName = null;
/** @type {string | null} */
let detailSelectedVersion = null;
/** @type {string[]} */
let detailOnDiskVersions = [];
let detailVersionSeq = 0;

const detailPageEl = document.getElementById('page-service-detail');
let linkSourcePath = null;
/** @type {Map<string, string>} */
const rowErrors = new Map();
let dashboardGlobalError = null;
let dashboardPollTimer = null;
let lastDashboardSnapshot = '';
let lastDetailBadgeKey = '';
let siteSearchQuery = '';
/** @type {Set<string>} */
const bootstrapStarting = new Set();
let isBootstrapping = false;

const RUNTIME_TO_BUNDLED = {
  nginx: 'nginx',
  'php-fpm': 'php',
  mysql: 'mysql',
  postgres: 'postgres',
  redis: 'redis',
};

const sitesSummaryEl = document.getElementById('sites-summary');
const sitesSummaryCountEl = document.getElementById('sites-summary-count');
const dashboardStatsEl = document.getElementById('dashboard-stats');
const pageTitleEl = document.getElementById('page-title');
const dashboardEl = document.getElementById('dashboard-services');
const siteListEl = document.getElementById('site-list');
const catalogGridEl = document.getElementById('catalog-grid');
const detailRootEl = document.getElementById('service-detail-root');
const siteDetailRootEl = document.getElementById('site-detail-root');
const phpBarEl = document.getElementById('php-bar');
const phpSelectEl = document.getElementById('php-default-select');
const dashboardLiveEl = document.getElementById('dashboard-live');
const dashboardPageEl = document.getElementById('page-dashboard');
const logsListEl = document.getElementById('logs-list');
const logsPanelViewEl = document.getElementById('logs-panel-view');
const logsPanelTitleEl = document.getElementById('logs-panel-title');
const btnLogsPopout = document.getElementById('btn-logs-popout');
const settingsRootEl = document.getElementById('settings-root');

/** @type {string | null} */
let activeLogsTabId = null;
/** @type {(() => void) | null} */
let logsTabAppendCleanup = null;

/** Global / service logs shown on the Logs tab (not per-site). */
const LOG_PAGE_KIND_ORDER = ['nginx', 'apache', 'php', 'mysql', 'postgres', 'redis'];
const LOG_PAGE_EXCLUDED_KINDS = new Set(['site', 'laravel']);
const LOG_KIND_LABELS = {
  nginx: 'Nginx',
  apache: 'Apache',
  php: 'PHP',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  redis: 'Redis',
};

function isGlobalLogSource(src) {
  return src?.kind && !LOG_PAGE_EXCLUDED_KINDS.has(src.kind);
}

const SETTINGS_SERVICES = [
  { key: 'nginx', label: 'Nginx' },
  { key: 'php', label: 'PHP-FPM' },
  { key: 'mysql', label: 'MySQL' },
  { key: 'postgres', label: 'PostgreSQL' },
  { key: 'redis', label: 'Redis' },
  { key: 'nodejs', label: 'Node.js' },
  { key: 'phpmyadmin', label: 'phpMyAdmin' },
];

function showBootError(err) {
  const msg = err?.message ?? String(err);
  const banner = document.createElement('div');
  banner.className = 'boot-error';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `<strong>${escapeHtml(BRAND.name)} failed to start</strong><pre>${escapeHtml(msg)}</pre><p>Try rebuilding (<code>npm run build</code>) and restart. Open DevTools (View) for details.</p>`;
  document.body.prepend(banner);
  if (sitesSummaryCountEl) sitesSummaryCountEl.textContent = '!';
  if (sitesSummaryEl) sitesSummaryEl.textContent = 'Error';
}

function closeAllModals() {
  document.querySelectorAll('dialog.modal').forEach((d) => {
    if (d.open) d.close();
  });
}

function wireNavigation() {
  document.querySelectorAll('.nav__link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.dataset.route;
      if (route) go(route);
    });
  });
}

function wireWindowChrome() {
  const api = window.devmgr?.window;
  if (!api) return;

  document.getElementById('btn-win-minimize')?.addEventListener('click', () => api.minimize());
  document.getElementById('btn-win-maximize')?.addEventListener('click', () => api.maximize());
  document.getElementById('btn-win-close')?.addEventListener('click', () => api.close());

  const maxBtn = document.getElementById('btn-win-maximize');
  const syncMaxIcon = (maximized = document.body.classList.contains('is-maximized')) => {
    document.body.classList.toggle('is-maximized', maximized);
    if (!maxBtn) return;
    maxBtn.title = maximized ? 'Restore' : 'Maximize';
    maxBtn.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
  };

  api.onMaximized?.(syncMaxIcon);
}

function setDetailInstallBusy(serviceId, busy) {
  const root = document.querySelector(`[data-install-id="${serviceId}"]`);
  if (!root) return;
  root.classList.toggle('is-installing', busy);
  root.querySelectorAll('.btn-install, .btn-update, .btn-uninstall').forEach((btn) => {
    btn.disabled = busy;
  });
  const select = root.querySelector('.version-select');
  if (select) select.disabled = busy;
  const runtime = detailRootEl?.querySelector('[data-detail-runtime]');
  if (runtime) {
    runtime.querySelectorAll('button').forEach((btn) => {
      btn.disabled = busy;
    });
  }
}

function updateInstallProgress(progress) {
  const root = document.querySelector(
    `[data-install-id="${progress.serviceId}"]`,
  );
  if (!root) return;
  const wrap = root.querySelector('.progress');
  const bar = root.querySelector('.progress__bar');
  const label = root.querySelector('.progress__label');
  wrap?.classList.add('is-active');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, progress.percent))}%`;
  if (label) label.textContent = progress.message;
  if (progress.phase === 'done' || progress.phase === 'error') {
    busyServiceId = null;
    setDetailInstallBusy(progress.serviceId, false);
    if (progress.phase === 'done') {
      const svc = bundledById(progress.serviceId);
      toast.success(`${svc?.name ?? progress.serviceId} installed`);
    } else {
      toast.error(progress.message || 'Install failed');
    }
    setTimeout(() => {
      wrap?.classList.remove('is-active');
      refresh();
    }, progress.phase === 'done' ? 500 : 0);
  }
}

function compareVer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function runtimeStatus(name) {
  const svc = state.status?.services?.find((s) => s.name === name);
  return svc ?? { name, state: 'stopped' };
}

function bundledById(id) {
  return state.status?.bundledServices?.find((s) => s.id === id);
}

function navigate() {
  const route = parseRoute();
  document.querySelectorAll('.nav__link').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.route === route.navRoute);
  });
  document.querySelectorAll('.page').forEach((el) => {
    const page = el.dataset.page;
    el.hidden = page !== route.page;
    el.classList.toggle('is-active', page === route.page);
  });
  pageTitleEl.textContent = route.title;
  pageTitleEl.classList.remove('title-enter');
  void pageTitleEl.offsetWidth;
  pageTitleEl.classList.add('title-enter');
  if (route.page === 'service-detail' && route.serviceId) {
    detailServiceId = route.serviceId;
    detailSiteName = null;
    detailSelectedVersion = null;
    void renderServiceDetail(route.serviceId);
  } else if (route.page === 'site-detail' && route.siteName) {
    detailSiteName = route.siteName;
    detailServiceId = null;
    void renderSiteDetail(route.siteName);
  } else if (route.page === 'logs') {
    detailSiteName = null;
    detailServiceId = null;
    void renderLogsPage();
  } else if (route.page === 'settings') {
    detailSiteName = null;
    detailServiceId = null;
    void renderSettingsPage();
  } else {
    detailSiteName = null;
    detailServiceId = null;
    void teardownLogsTabViewer();
  }
  syncDashboardPoll();
  void refreshPageContent(route.page);
}

async function refreshPageContent(page) {
  if (!state.status) return;
  if (page === 'dashboard') {
    try {
      renderDashboard({ force: true });
      renderDashboardWarnings();
      renderDashboardAlert();
    } catch {
      // ignore
    }
    return;
  }
  if (page === 'sites') renderSites();
  if (page === 'services') renderCatalog();
}

function parseRoute() {
  const raw = (location.hash.slice(1) || '/').replace(/\/+$/, '') || '/';
  if (raw.startsWith('/services/')) {
    const serviceId = raw.split('/')[2];
    const svc = bundledById(serviceId);
    return {
      page: 'service-detail',
      navRoute: '/services',
      serviceId,
      title: svc?.name ?? 'Service',
    };
  }
  if (raw.startsWith('/sites/')) {
    const siteName = decodeURIComponent(raw.split('/')[2] ?? '');
    const site = state.status?.sites?.find((s) => s.name === siteName);
    return {
      page: 'site-detail',
      navRoute: '/sites',
      siteName,
      title: site?.hostname ?? (siteName || 'Site'),
    };
  }
  if (raw === '/sites') {
    return { page: 'sites', navRoute: '/sites', title: 'Sites' };
  }
  if (raw === '/services') {
    return { page: 'services', navRoute: '/services', title: 'Services' };
  }
  if (raw === '/logs') {
    return { page: 'logs', navRoute: '/logs', title: 'Logs' };
  }
  if (raw === '/settings') {
    return { page: 'settings', navRoute: '/settings', title: 'Settings' };
  }
  return { page: 'dashboard', navRoute: '/', title: 'Dashboard' };
}

function go(path) {
  location.hash = path;
}

window.addEventListener('hashchange', navigate);

async function openInExternalBrowser(url) {
  await window.devmgr.shell.openExternal(url);
}

function bindExternalUrlLinks(root) {
  root.querySelectorAll('[data-open-url]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const url = el.getAttribute('data-open-url');
      if (!url) return;
      void runActionClick(e, {
        key: `open-url-${url}`,
        label: 'Open link',
        successToast: false,
        run: () => openInExternalBrowser(url),
      });
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function siteMatchesQuery(site, q) {
  if (!q) return true;
  return `${site.name} ${site.hostname} ${site.framework}`.toLowerCase().includes(q);
}

function bundledIdForRuntime(runtime) {
  return RUNTIME_TO_BUNDLED[runtime] ?? runtime;
}

function setBootstrapping(active) {
  isBootstrapping = active;
  document.body.dataset.bootstrapping = active ? '1' : '';
}

/** @returns {[string, string]} badge class + short label */
function badgeForRuntime(rt, bundledId) {
  if (bootstrapStarting.has(bundledId)) return ['badge--starting', 'Starting'];
  if (rowErrors.has(bundledId)) return ['badge--error', 'Failed'];
  if (rt.state === 'running') return ['badge--running', 'Running'];
  if (rt.state === 'not_configured') return ['badge--missing', 'Not set up'];
  return ['badge--stopped', 'Stopped'];
}

function statusBadgeHtml(badgeCls, label, { detail = false } = {}) {
  const showDot = !badgeCls.includes('missing');
  const dot = showDot ? '<span class="status-badge__dot" aria-hidden="true"></span>' : '';
  const detailAttr = detail ? ' data-detail-status-badge' : '';
  return `<span class="status-badge badge ${badgeCls}" role="status"${detailAttr}>${dot}<span class="status-badge__label">${escapeHtml(label)}</span></span>`;
}

function rowErrorText(bundledId) {
  return rowErrors.get(bundledId) ?? null;
}

function renderDashboardWarnings() {
  const warnings = state.status?.warnings ?? [];
  const existing = document.getElementById('dashboard-warnings');
  if (!warnings.length || !dashboardPageEl) {
    existing?.remove();
    return;
  }

  const text = warnings.join('\n\n');
  if (existing) {
    const body = existing.querySelector('.dashboard-alert__body');
    if (body) body.textContent = text;
    return;
  }

  const alert = document.createElement('div');
  alert.id = 'dashboard-warnings';
  alert.className = 'dashboard-alert dashboard-alert--warn dashboard-alert--enter';
  alert.innerHTML = `<pre class="dashboard-alert__body">${escapeHtml(text)}</pre>`;

  const phpBar = document.getElementById('php-bar');
  if (phpBar) {
    dashboardPageEl.insertBefore(alert, phpBar);
  } else {
    dashboardLiveEl?.after(alert);
  }
}

function renderDashboardAlert() {
  const existing = document.getElementById('dashboard-alert');
  if (!dashboardGlobalError || !dashboardPageEl) {
    existing?.remove();
    return;
  }

  if (existing) {
    const body = existing.querySelector('.dashboard-alert__body');
    if (body) body.textContent = dashboardGlobalError;
    return;
  }

  const alert = document.createElement('div');
  alert.id = 'dashboard-alert';
  alert.className = 'dashboard-alert dashboard-alert--enter';
  alert.innerHTML = `
    <pre class="dashboard-alert__body">${escapeHtml(dashboardGlobalError)}</pre>
    <button type="button" class="btn btn--icon dashboard-alert__close" title="Dismiss" aria-label="Dismiss">${ICONS.dismiss}</button>
  `;
  alert.querySelector('.dashboard-alert__close')?.addEventListener('click', () => {
    dashboardGlobalError = null;
    lastDashboardSnapshot = '';
    renderDashboardAlert();
    renderDashboard();
  });

  const phpBar = document.getElementById('php-bar');
  if (phpBar) {
    dashboardPageEl.insertBefore(alert, phpBar);
  } else {
    dashboardLiveEl?.after(alert);
  }
}

function dashboardSnapshot() {
  const errors = [...rowErrors.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify({
    e: errors,
    r: RUNTIME_ROWS.map(({ bundledId, runtime }) => {
      const bundled = bundledById(bundledId);
      const rt = runtimeStatus(runtime);
      return {
        id: bundledId,
        s: rt.state,
        p: rt.port ?? '',
        i: Boolean(bundled?.installed),
        v: bundled?.installedVersion ?? '',
        b: bootstrapStarting.has(bundledId),
      };
    }),
  });
}

function syncDashboardPoll() {
  const onDashboard = parseRoute().page === 'dashboard';
  if (dashboardLiveEl) dashboardLiveEl.hidden = !onDashboard;
  if (onDashboard) {
    if (!dashboardPollTimer) {
      dashboardPollTimer = setInterval(() => {
        if (parseRoute().page === 'dashboard') void refreshDashboardLive();
      }, DASHBOARD_POLL_MS);
    }
  } else if (dashboardPollTimer) {
    clearInterval(dashboardPollTimer);
    dashboardPollTimer = null;
  }
}

async function refreshDashboardLive() {
  try {
    const live = await window.devmgr.statusLive();
    if (state.status) {
      state.status.services = live.services;
      state.status.bundledServices = live.bundledServices;
    } else {
      state.status = await window.devmgr.status();
    }
    renderDashboard();
    updateTopbarFromStatus();
  } catch {
    // keep last good state
  }
}

function setAutostartTopbar(text, visible) {
  const el = document.getElementById('autostart-status');
  if (!el) return;
  if (!visible) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function wireBootstrap() {
  if (!window.devmgr?.bootstrap) return;

  window.devmgr.bootstrap.onPhase((phase) => {
    if (phase === 'config') {
      setBootstrapping(true);
      setAutostartTopbar('Preparing…', true);
      void refresh().then(() => renderDashboard({ force: true }));
      return;
    }
    if (phase === 'listed') {
      setAutostartTopbar('Starting services…', true);
      bootstrapStarting.clear();
      lastDashboardSnapshot = '';
      renderDashboard({ force: true });
      return;
    }
    if (phase && typeof phase === 'object' && phase.kind === 'starting') {
      const bundledId = bundledIdForRuntime(phase.service);
      bootstrapStarting.add(bundledId);
      const label = bundledById(bundledId)?.name ?? phase.service;
      setAutostartTopbar(`Starting ${label}…`, true);
      lastDashboardSnapshot = '';
      renderDashboard({ force: true });
      return;
    }
    if (phase && typeof phase === 'object' && phase.kind === 'started') {
      const bundledId = bundledIdForRuntime(phase.service);
      bootstrapStarting.delete(bundledId);
      lastDashboardSnapshot = '';
      void refreshDashboardLive();
      return;
    }
    if (phase === 'finishing') {
      setAutostartTopbar('Finishing setup…', true);
      return;
    }
    if (phase === 'ready') {
      bootstrapStarting.clear();
      setBootstrapping(false);
      setAutostartTopbar('', false);
    }
  });

  window.devmgr.bootstrap.onDone((payload) => {
    bootstrapStarting.clear();
    setBootstrapping(false);
    setAutostartTopbar('', false);
    if (payload?.error) {
      toast.error(payload.error);
      dashboardGlobalError = payload.error;
    }
    void refresh();
  });
}

function updateTopbarFromStatus() {
  const bundled = state.status?.bundledServices ?? [];
  const hasAnyInstalled = bundled.some((s) => s.installed);
  const startBtn = document.getElementById('btn-start-all');
  const stopBtn = document.getElementById('btn-stop-all');
  const applyBtn = document.getElementById('btn-apply');
  const hostsBtn = document.getElementById('btn-sync-hosts');
  const disabled = isBootstrapping;
  if (startBtn) startBtn.disabled = disabled || !hasAnyInstalled;
  if (stopBtn) stopBtn.disabled = disabled || !hasAnyInstalled;
  if (applyBtn) applyBtn.disabled = disabled || !bundled.find((s) => s.id === 'nginx')?.installed;
  if (hostsBtn) hostsBtn.disabled = disabled;
}

async function openServiceLog(bundledId) {
  const logId = await window.devmgr.logs.resolveForService(bundledId);
  if (!logId) {
    toast.info('No log file for this service yet. Start it and try again.');
    return;
  }
  const sources = await window.devmgr.logs.list();
  const src = sources.find((s) => s.id === logId);
  await window.devmgr.logs.open(logId, src?.label ?? 'Log');
  toast.success('Log opened');
}

async function openSiteLog(siteName) {
  const logId = await window.devmgr.site.resolveLog(siteName);
  if (!logId) {
    toast.info('No Laravel log file found for this project.');
    return;
  }
  const sources = await window.devmgr.logs.list();
  const src = sources.find((s) => s.id === logId);
  await window.devmgr.logs.open(logId, src?.label ?? 'Laravel log');
  toast.success('Log opened');
}

async function runSiteArtisan(siteName, args, root, trigger) {
  const out = root.querySelector('[data-artisan-output]');
  const actions = root.querySelector('[data-site-actions]');
  const cmd = args.length ? `artisan ${args.join(' ')}` : 'artisan';
  await runAction({
    key: `artisan-${siteName}-${args.join('-')}`,
    label: cmd,
    trigger,
    run: async () => {
      if (out) {
        out.hidden = false;
        out.textContent = 'Running…';
      }
      actions?.classList.add('is-busy');
      try {
        const text = await window.devmgr.site.artisan(siteName, args);
        if (out) out.textContent = text;
      } finally {
        actions?.classList.remove('is-busy');
      }
    },
  });
}

async function runServiceAction(
  bundledId,
  runtime,
  action,
  { captureError = false, trigger = null, verb = 'Start' } = {},
) {
  const svc = bundledById(bundledId);
  const name = svc?.name ?? bundledId;
  const label = verb === 'Stop' ? `Stop ${name}` : `Start ${name}`;
  const onDetail =
    detailServiceId === bundledId && parseRoute().page === 'service-detail';
  const busyEl = onDetail
    ? detailRootEl.querySelector('[data-detail-runtime]')
    : dashboardEl?.querySelector(`[data-row="${bundledId}"]`);

  await runAction({
    key: `${bundledId}-${verb}`,
    label,
    trigger,
    run: async () => {
      busyEl?.classList.add('is-busy');
      try {
        await action();
        rowErrors.delete(bundledId);
      } catch (err) {
        const msg = err?.message ?? String(err);
        if (captureError) {
          rowErrors.set(bundledId, msg);
          if (onDetail) void updateDetailRuntimeUI(bundledId);
        }
        throw err;
      } finally {
        busyEl?.classList.remove('is-busy');
        if (onDetail) await refreshDetailStatus();
        else await refreshDashboardLive();
      }
    },
  });
}

async function refreshDetailStatus() {
  const live = await window.devmgr.statusLive();
  if (state.status) {
    state.status.services = live.services;
    state.status.bundledServices = live.bundledServices;
  } else {
    state.status = await window.devmgr.status();
  }
  if (detailServiceId) {
    await updateDetailRuntimeUI(detailServiceId);
    void handleDetailVersionChange(detailServiceId);
  }
  if (parseRoute().page === 'dashboard') {
    renderDashboard();
  }
}

async function getDetailVersionContext(serviceId) {
  const svc = bundledById(serviceId);
  const runtime = BUNDLED_RUNTIME[serviceId];
  if (!svc || !runtime) return null;

  const version = getSelectedDetailVersion(serviceId, svc);
  if (!version) return null;

  const info = await window.devmgr.services.versionInfo(serviceId, version);
  const rt = runtimeStatus(runtime);
  return {
    svc,
    version,
    info,
    runtime,
    rt,
    isRunning: rt.state === 'running',
  };
}

async function ensureSelectedVersionActive(serviceId) {
  const ctx = await getDetailVersionContext(serviceId);
  if (!ctx) throw new Error('Service not found');
  if (!ctx.info.installed) {
    throw new Error(`Version ${ctx.version} is not installed`);
  }
  if (!ctx.info.active) {
    state.status = await window.devmgr.services.setActive(serviceId, ctx.version);
    ctx.info.active = true;
    ctx.svc = bundledById(serviceId) ?? ctx.svc;
  }
  return ctx;
}

async function startDetailService(serviceId) {
  const ctx = await getDetailVersionContext(serviceId);
  if (!ctx) throw new Error('Service not found');
  if (!ctx.info.installed) {
    throw new Error(`Version ${ctx.version} is not installed`);
  }

  const wasRunning = ctx.isRunning;
  const needsSwitch = wasRunning && !ctx.info.active;

  if (!ctx.info.active) {
    state.status = await window.devmgr.services.setActive(serviceId, ctx.version);
  }

  if (needsSwitch) {
    await window.devmgr.service.stop(ctx.runtime);
    await window.devmgr.service.start(ctx.runtime);
  } else if (!wasRunning) {
    await window.devmgr.service.start(ctx.runtime);
  }
}

async function stopDetailService(serviceId) {
  const ctx = await getDetailVersionContext(serviceId);
  if (!ctx) throw new Error('Service not found');
  if (!ctx.isRunning) return;
  if (!ctx.info.active) {
    const runningVer = ctx.svc.installedVersion ?? 'another version';
    throw new Error(
      `${runningVer} is running. Select that version in the list to stop it, or use Start to switch.`,
    );
  }
  await window.devmgr.service.stop(ctx.runtime);
}

async function updateDetailRuntimeUI(serviceId) {
  const ctx = await getDetailVersionContext(serviceId);
  if (!ctx) return;

  let badgeCls;
  let badgeText;
  const activeVer = ctx.svc.installedVersion;

  if (!ctx.info.installed) {
    badgeCls = 'badge--missing';
    badgeText = 'Not installed';
  } else if (ctx.isRunning && !ctx.info.active && activeVer) {
    badgeCls = 'badge--running';
    badgeText = `Running (${activeVer})`;
  } else {
    [badgeCls, badgeText] = badgeForRuntime(ctx.rt, serviceId);
  }

  const badge = detailRootEl.querySelector('[data-detail-status-badge]');
  if (badge) {
    const badgeKey = `${badgeCls}|${badgeText}`;
    const next = statusBadgeHtml(badgeCls, badgeText, { detail: true });
    if (badge.outerHTML !== next) badge.outerHTML = next;
    const updated = detailRootEl.querySelector('[data-detail-status-badge]');
    if (badgeKey !== lastDetailBadgeKey && updated) {
      lastDetailBadgeKey = badgeKey;
      updated.classList.remove('status-flash');
      void updated.offsetWidth;
      updated.classList.add('status-flash');
    }
  }

  const startBtn = detailRootEl.querySelector('[data-detail-runtime] .btn-start-one');
  const stopBtn = detailRootEl.querySelector('[data-detail-runtime] .btn-stop-one');
  const canStart =
    ctx.info.installed && (!ctx.isRunning || !ctx.info.active);
  const canStop = ctx.isRunning && ctx.info.active;
  if (startBtn) {
    startBtn.disabled = !canStart;
    startBtn.title = canStart
      ? ctx.info.active
        ? 'Start'
        : `Activate ${ctx.version} and start`
      : 'Already running this version';
  }
  if (stopBtn) {
    stopBtn.disabled = !canStop;
    stopBtn.title = canStop
      ? `Stop ${ctx.version}`
      : ctx.isRunning && activeVer
        ? `${activeVer} is running — select it to stop`
        : 'Stop';
  }
}

function renderDashboardStats(running, stopped, errors) {
  if (!dashboardStatsEl) return;
  dashboardStatsEl.hidden = false;
  const errorCard =
    errors > 0
      ? `<div class="stat-card stat-card--warn" role="status">
          <span class="stat-card__value">${errors}</span>
          <span class="stat-card__label">Needs attention</span>
        </div>`
      : '';
  dashboardStatsEl.innerHTML = `
    <div class="stat-card stat-card--highlight" role="status">
      <span class="stat-card__value">${running}</span>
      <span class="stat-card__label">Running</span>
    </div>
    <div class="stat-card" role="status">
      <span class="stat-card__value">${stopped}</span>
      <span class="stat-card__label">Stopped</span>
    </div>
    ${errorCard}
  `;
}

function renderDashboard({ force = false } = {}) {
  if (!dashboardEl) return;
  const snapshot = dashboardSnapshot();
  if (!force && snapshot === lastDashboardSnapshot) return;
  lastDashboardSnapshot = snapshot;

  dashboardEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'service-table__head';
  header.innerHTML =
    '<span>Service</span><span>Status</span><span>Port</span><span>Version</span><span>Actions</span>';
  dashboardEl.appendChild(header);

  let runningCount = 0;
  let installedCount = 0;
  let errorCount = 0;

  for (const row of RUNTIME_ROWS) {
    const bundled = bundledById(row.bundledId);
    const rt = runtimeStatus(row.runtime);
    const installed = bundled?.installed;

    if (rt.state === 'running') {
      rowErrors.delete(row.bundledId);
    }

    const [badgeCls, badgeText] = installed
      ? badgeForRuntime(rt, row.bundledId)
      : ['badge--missing', 'Not installed'];
    const portLabel = installed && rt.port ? rt.port : '—';
    const portClass =
      installed && rt.state === 'running' ? 'service-table__port is-live' : 'service-table__port';
    const errText = installed ? rowErrorText(row.bundledId) : null;
    const isRunning = rt.state === 'running';
    const isStarting = bootstrapStarting.has(row.bundledId);
    const startDisabled = !installed || isRunning || isStarting;
    const stopDisabled = !installed || !isRunning || isStarting;

    if (installed) installedCount += 1;
    if (isRunning) runningCount += 1;
    if (errText) errorCount += 1;

    const wrap = document.createElement('div');
    wrap.className = 'service-table__group';
    wrap.dataset.row = row.bundledId;

    const el = document.createElement('div');
    el.className = `service-table__row${isStarting ? ' is-starting' : ''}${isRunning ? ' is-running' : ''}${errText ? ' has-error' : ''}`;
    el.innerHTML = `
      <div class="service-table__name">
        <strong>${escapeHtml(bundled?.name ?? row.bundledId)}</strong>
        <small>${escapeHtml(bundled?.description ?? '')}</small>
      </div>
      ${statusBadgeHtml(badgeCls, badgeText)}
      <span class="${portClass}" title="Listening port">${escapeHtml(portLabel)}</span>
      <span class="service-table__ver">${installed ? `v${escapeHtml(bundled.installedVersion)}` : '—'}</span>
      <div class="service-table__actions">
        ${iconBtn('btn-start-one', ICONS.play, 'Start', startDisabled, 'primary')}
        ${iconBtn('btn-stop-one', ICONS.stop, 'Stop', stopDisabled, 'danger')}
        ${iconBtn('btn-log', ICONS.log, 'Open log', !installed)}
        <a href="#/services/${row.bundledId}" class="btn btn--icon btn-settings" title="Settings" aria-label="Settings">${ICONS.settings}</a>
      </div>
    `;

    el.querySelector('.btn-start-one')?.addEventListener('click', (e) =>
      runServiceAction(
        row.bundledId,
        row.runtime,
        () => window.devmgr.service.start(row.runtime),
        { captureError: true, trigger: e.currentTarget, verb: 'Start' },
      ),
    );
    el.querySelector('.btn-stop-one')?.addEventListener('click', (e) =>
      runServiceAction(
        row.bundledId,
        row.runtime,
        () => window.devmgr.service.stop(row.runtime),
        { trigger: e.currentTarget, verb: 'Stop' },
      ),
    );
    el.querySelector('.btn-log')?.addEventListener('click', (e) =>
      runActionClick(e, {
        key: `log-${row.bundledId}`,
        label: 'Open log',
        successToast: false,
        run: () => openServiceLog(row.bundledId),
      }),
    );

    wrap.appendChild(el);

    if (errText) {
      const errEl = document.createElement('div');
      errEl.className = 'service-table__error';
      errEl.innerHTML = `
        <pre class="service-table__error-text">${escapeHtml(errText)}</pre>
        <button type="button" class="btn btn--icon service-table__error-dismiss" title="Dismiss" aria-label="Dismiss error">${ICONS.dismiss}</button>
      `;
      errEl.querySelector('.service-table__error-dismiss')?.addEventListener('click', () => {
        rowErrors.delete(row.bundledId);
        lastDashboardSnapshot = '';
        renderDashboard();
      });
      wrap.appendChild(errEl);
    }

    dashboardEl.appendChild(wrap);
  }

  renderDashboardStats(runningCount, Math.max(0, installedCount - runningCount), errorCount);
}

async function teardownLogsTabViewer() {
  if (!activeLogsTabId) return;
  const id = activeLogsTabId;
  activeLogsTabId = null;
  logsTabAppendCleanup?.();
  logsTabAppendCleanup = null;
  try {
    await window.devmgr.logs.unfollow(id);
  } catch {
    // ignore
  }
  logsListEl?.querySelectorAll('.logs-list__item.is-active').forEach((el) => {
    el.classList.remove('is-active');
  });
  if (btnLogsPopout) btnLogsPopout.disabled = true;
}

async function selectLogsTabSource(id, label) {
  if (!logsPanelViewEl) return;
  if (activeLogsTabId === id) return;

  await teardownLogsTabViewer();
  activeLogsTabId = id;

  logsListEl?.querySelectorAll('.logs-list__item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.logId === id);
  });

  if (logsPanelTitleEl) logsPanelTitleEl.textContent = label;
  if (btnLogsPopout) {
    btnLogsPopout.disabled = false;
    btnLogsPopout.dataset.logId = id;
    btnLogsPopout.dataset.logLabel = label;
  }

  logsPanelViewEl.textContent = 'Loading…';
  try {
    const lines = await window.devmgr.logs.tail(id, 200);
    logsPanelViewEl.textContent = lines.join('\n') || '(empty)';
    logsPanelViewEl.scrollTop = logsPanelViewEl.scrollHeight;

    logsTabAppendCleanup = window.devmgr.logs.onAppend(({ id: sourceId, chunk }) => {
      if (sourceId !== id) return;
      logsPanelViewEl.textContent += chunk;
      logsPanelViewEl.scrollTop = logsPanelViewEl.scrollHeight;
    });
    await window.devmgr.logs.follow(id);
  } catch (err) {
    logsPanelViewEl.textContent = err?.message ?? String(err);
  }
}

async function renderLogsPage() {
  if (!logsListEl) return;

  const allSources = await window.devmgr.logs.list();
  const sources = allSources.filter(isGlobalLogSource);
  logsListEl.innerHTML = '';

  if (activeLogsTabId && !sources.some((s) => s.id === activeLogsTabId)) {
    await teardownLogsTabViewer();
    if (logsPanelViewEl) logsPanelViewEl.textContent = 'Select a log from the list.';
    if (logsPanelTitleEl) logsPanelTitleEl.textContent = 'Log viewer';
  }

  if (sources.length === 0) {
    logsListEl.innerHTML =
      '<li class="empty">No service log files yet. Start nginx, PHP, MySQL, etc.</li>';
    return;
  }

  const byKind = new Map();
  for (const src of sources) {
    const kind = src.kind || 'other';
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(src);
  }

  const kinds = [
    ...LOG_PAGE_KIND_ORDER.filter((k) => byKind.has(k)),
    ...[...byKind.keys()].filter((k) => !LOG_PAGE_KIND_ORDER.includes(k)),
  ];

  for (const kind of kinds) {
    const group = document.createElement('li');
    group.className = 'logs-list__group';
    group.innerHTML = `<span class="logs-list__group-title">${escapeHtml(LOG_KIND_LABELS[kind] ?? kind)}</span>`;
    const ul = document.createElement('ul');
    ul.className = 'logs-list__group-items';

    for (const src of byKind.get(kind)) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'logs-list__item';
      btn.dataset.logId = src.id;
      btn.dataset.logLabel = src.label;
      if (src.id === activeLogsTabId) btn.classList.add('is-active');
      btn.textContent = src.label;
      btn.addEventListener('click', (e) => {
        void runActionClick(e, {
          key: `logs-tab-${src.id}`,
          label: 'Load log',
          successToast: false,
          run: () => selectLogsTabSource(src.id, src.label),
        });
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }

    group.appendChild(ul);
    logsListEl.appendChild(group);
  }

  if (!activeLogsTabId && sources[0]) {
    await selectLogsTabSource(sources[0].id, sources[0].label);
  }
}

async function renderSettingsPage() {
  if (!settingsRootEl) return;

  const cfg = state.config;
  let envInfo = { candidates: [], selected: [], paths: [] };
  try {
    envInfo = await window.devmgr.env.info();
  } catch {
    // ignore
  }

  let sslStatus = state.status?.ssl ?? { trusted: false, caCertPath: '' };
  try {
    sslStatus = await window.devmgr.ssl.status();
  } catch {
    // ignore
  }
  const sslTrustLabel = sslStatus.trusted
    ? 'Trusted — browsers should show https://*.test sites as secure after a restart.'
    : `Not trusted — Chrome/Edge will show “Not secure” until you install the ${BRAND.name} CA.`;

  const envPathRows =
    envInfo.candidates.length > 0
      ? envInfo.candidates
          .map((c) => {
            const checked = envInfo.selected.includes(c.id) ? ' checked' : '';
            return `
        <label class="settings-toggle env-path-option">
          <input type="checkbox" data-env-path-id="${escapeHtml(c.id)}"${checked} />
          <span class="env-path-option__text">
            <strong>${escapeHtml(c.label)}</strong>
            <span class="mono env-path-option__path">${escapeHtml(c.path)}</span>
          </span>
        </label>
      `;
          })
          .join('')
      : '<p class="empty">No service paths available. Install and enable services first.</p>';
  const paths = {
    dataDir: state.status?.dataDir ?? '—',
    configPath: state.status?.configPath ?? '—',
    projectsDir: state.status?.projectsDir ?? '—',
    logsDir: state.status?.logsDir ?? '—',
  };

  const serviceRows = SETTINGS_SERVICES.map(({ key, label }) => {
    const enabled = cfg?.services?.[key]?.enabled !== false;
    return `
      <label class="settings-toggle">
        <input type="checkbox" name="svc-${key}" data-svc="${key}"${enabled ? ' checked' : ''} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }).join('');

  settingsRootEl.innerHTML = `
    <section class="detail-section settings-section">
      <h3>Paths</h3>
      <dl class="site-detail__info">
        <div class="site-detail__row">
          <dt>Data directory</dt>
          <dd class="mono settings-path">
            <span>${escapeHtml(paths.dataDir)}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-open-path="${escapeHtml(paths.dataDir)}">Open</button>
          </dd>
        </div>
        <div class="site-detail__row">
          <dt>Config file</dt>
          <dd class="mono settings-path">
            <span>${escapeHtml(paths.configPath)}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-open-path="${escapeHtml(paths.configPath)}">Open</button>
          </dd>
        </div>
        <div class="site-detail__row">
          <dt>Projects</dt>
          <dd class="mono settings-path">
            <span>${escapeHtml(paths.projectsDir)}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-open-path="${escapeHtml(paths.projectsDir)}">Open</button>
          </dd>
        </div>
        <div class="site-detail__row">
          <dt>Logs</dt>
          <dd class="mono settings-path">
            <span>${escapeHtml(paths.logsDir)}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-open-path="${escapeHtml(paths.logsDir)}">Open</button>
          </dd>
        </div>
      </dl>
    </section>
    <section class="detail-section settings-section">
      <h3>HTTPS (*.test)</h3>
      <p class="detail-hint">${escapeHtml(BRAND.name)} signs local sites with its own certificate authority. Trust it once in Windows (admin/UAC), then restart your browser.</p>
      <p class="ssl-trust-status ${sslStatus.trusted ? 'ssl-trust-status--ok' : 'ssl-trust-status--warn'}">${escapeHtml(sslTrustLabel)}</p>
      <p class="detail-hint mono ssl-trust-ca">${escapeHtml(sslStatus.caCertPath || '')}</p>
      <div class="settings-actions">
        <button type="button" class="btn btn--primary btn--sm" id="btn-trust-ssl"${sslStatus.trusted ? ' disabled' : ''}>Trust SSL certificate</button>
      </div>
      <p class="settings-status" id="ssl-status" hidden></p>
    </section>
    <section class="detail-section settings-section">
      <h3>Environment (PATH)</h3>
      <p class="detail-hint">Choose which folders to add to your Windows user PATH. Apply and PHP version changes sync the checked items automatically.</p>
      <div class="env-path-toolbar">
        <button type="button" class="btn btn--ghost btn--sm" id="btn-env-select-all">Select all</button>
        <button type="button" class="btn btn--ghost btn--sm" id="btn-env-select-none">Select none</button>
      </div>
      <div class="env-path-select">${envPathRows}</div>
      <div class="settings-actions">
        <button type="button" class="btn btn--ghost btn--sm" id="btn-env-save">Save selection</button>
        <button type="button" class="btn btn--ghost btn--sm" id="btn-env-sync">Update PATH now</button>
        <button type="button" class="btn btn--primary btn--sm" id="btn-env-restart">Restart env</button>
      </div>
      <p class="settings-status" id="env-status" hidden></p>
    </section>
    <section class="detail-section settings-section">
      <h3>Services</h3>
      <p class="detail-hint">Disabled services are skipped by Start all and autostart, and are stopped when you save. Settings are applied automatically when you save.</p>
      <div class="settings-toggles">${serviceRows}</div>
      <div class="settings-actions">
        <button type="button" class="btn btn--primary" id="btn-save-settings">Save settings</button>
      </div>
      <p class="settings-status" id="settings-status" hidden></p>
    </section>
    <section class="detail-section settings-section">
      <h3>General</h3>
      <dl class="site-detail__info">
        <div class="site-detail__row">
          <dt>Web server</dt>
          <dd>${escapeHtml(cfg?.general?.web_server ?? 'nginx')}</dd>
        </div>
      </dl>
    </section>
  `;

  settingsRootEl.querySelectorAll('[data-open-path]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const p = btn.getAttribute('data-open-path');
      if (!p || p === '—') return;
      void runActionClick(e, {
        key: `open-path-${p}`,
        label: 'Open folder',
        successToast: false,
        run: () => window.devmgr.settings.openPath(p),
      });
    });
  });

  const showSslStatus = (text, ok) => {
    const el = settingsRootEl.querySelector('#ssl-status');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = `settings-status ${ok ? 'settings-status--ok' : 'settings-status--err'}`;
  };

  settingsRootEl.querySelector('#btn-trust-ssl')?.addEventListener('click', (e) => {
    void runActionClick(e, {
      key: 'ssl-trust',
      label: 'Trust SSL certificate',
      global: true,
      successToast: false,
      errorToast: false,
      run: async () => {
        const result = await window.devmgr.ssl.trust();
        showSslStatus(result.message, result.ok);
        if (result.ok) {
          toast.success('SSL certificate trusted');
          state.status = await window.devmgr.status();
          await renderSettingsPage();
          renderDashboardWarnings();
        } else {
          toast.error(result.message);
        }
      },
    });
  });

  const showEnvStatus = (text, ok) => {
    const el = settingsRootEl.querySelector('#env-status');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = ok ? 'settings-status settings-status--ok' : 'settings-status settings-status--err';
  };

  const readEnvPathSelection = () =>
    [...settingsRootEl.querySelectorAll('[data-env-path-id]:checked')].map((el) =>
      el.getAttribute('data-env-path-id'),
    );

  const persistEnvSelection = async () => {
    const selected = readEnvPathSelection();
    const result = await window.devmgr.settings.save({
      general: { path_env_selected: selected },
    });
    state.config = result.config ?? result;
    if (result.status) state.status = result.status;
    return selected;
  };

  settingsRootEl.querySelector('#btn-env-select-all')?.addEventListener('click', () => {
    settingsRootEl.querySelectorAll('[data-env-path-id]').forEach((el) => {
      el.checked = true;
    });
  });

  settingsRootEl.querySelector('#btn-env-select-none')?.addEventListener('click', () => {
    settingsRootEl.querySelectorAll('[data-env-path-id]').forEach((el) => {
      el.checked = false;
    });
  });

  settingsRootEl.querySelector('#btn-env-save')?.addEventListener('click', (e) => {
    void runActionClick(e, {
      key: 'env-save',
      label: 'Save PATH selection',
      run: async () => {
        await persistEnvSelection();
        showEnvStatus('Selection saved and applied.', true);
        await refresh();
      },
    });
  });

  settingsRootEl.querySelector('#btn-env-sync')?.addEventListener('click', (e) => {
    void runActionClick(e, {
      key: 'env-sync',
      label: 'Update PATH',
      global: true,
      successToast: false,
      run: async () => {
        await persistEnvSelection();
        const result = await window.devmgr.env.sync();
        showEnvStatus(result.message, result.ok);
        if (result.ok) toast.success('PATH updated');
        else toast.error(result.message);
        await refresh();
      },
    });
  });

  settingsRootEl.querySelector('#btn-env-restart')?.addEventListener('click', (e) => {
    void runActionClick(e, {
      key: 'env-restart',
      label: 'Restart environment',
      global: true,
      successToast: false,
      run: async () => {
        await persistEnvSelection();
        const result = await window.devmgr.env.restart(true);
        showEnvStatus(result.message, result.ok);
        if (result.ok) toast.success('Environment restarted');
        else toast.error(result.message);
      },
    });
  });

  settingsRootEl.querySelector('#btn-save-settings')?.addEventListener('click', (e) => {
    const statusEl = settingsRootEl.querySelector('#settings-status');
    void runActionClick(e, {
      key: 'settings-save',
      label: 'Save settings',
      global: true,
      run: async () => {
        const services = {};
        for (const { key } of SETTINGS_SERVICES) {
          const input = settingsRootEl.querySelector(`[data-svc="${key}"]`);
          if (input) services[key] = { enabled: input.checked };
        }
        const result = await window.devmgr.settings.save({
          general: { path_env_selected: readEnvPathSelection() },
          services,
        });
        state.config = result.config ?? result;
        if (result.status) state.status = result.status;
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = 'Saved and applied.';
          statusEl.className = 'settings-status settings-status--ok';
        }
        await refresh();
      },
    });
  });
}

async function renderPhpBar() {
  const versions = await window.devmgr.php.versions();
  const current = await window.devmgr.php.defaultVersion();
  if (versions.length === 0) {
    phpBarEl.hidden = true;
    return;
  }
  phpBarEl.hidden = false;
  phpSelectEl.innerHTML = versions
    .map((v) => `<option value="${v}"${v === current ? ' selected' : ''}>PHP ${v}</option>`)
    .join('');
}

function renderSites() {
  const sites = state.status?.sites ?? [];
  const q = siteSearchQuery.trim().toLowerCase();
  const visible = sites.filter((s) => siteMatchesQuery(s, q));
  siteListEl.innerHTML = '';

  if (sites.length === 0) {
    siteListEl.innerHTML =
      '<li class="empty">No projects yet. Create a Laravel app, clone from Git, or add an existing project.</li>';
    return;
  }
  if (visible.length === 0) {
    siteListEl.innerHTML = `<li class="empty">No sites match “${escapeHtml(siteSearchQuery)}”.</li>`;
    return;
  }

  for (const site of visible) {
    const li = document.createElement('li');
    li.className = `site-card${site.enabled === false ? ' is-disabled' : ''}`;
    const detailHref = `#/sites/${encodeURIComponent(site.name)}`;
    const url = `https://${site.hostname}`;
    const favIcon = site.favorite ? ICONS.starFilled : ICONS.star;
    li.innerHTML = `
      <a href="${detailHref}" class="site-card__link">
        <div class="site-card__main">
          <span class="site-card__host">${escapeHtml(site.hostname)}</span>
          <span class="site-card__fw">${escapeHtml(site.framework)}</span>
        </div>
        <p class="site-card__path">${escapeHtml(site.doc_root)}</p>
      </a>
      ${site.enabled === false ? '<span class="site-card__tag">Disabled</span>' : ''}
      <div class="site-card__actions">
        <button type="button" class="btn btn--icon site-fav${site.favorite ? ' is-favorite' : ''}" title="${site.favorite ? 'Unfavorite' : 'Favorite'}" aria-label="Favorite" aria-pressed="${site.favorite ? 'true' : 'false'}">${favIcon}</button>
        <button type="button" class="btn btn--icon site-copy" title="Copy URL" aria-label="Copy URL">${ICONS.copy}</button>
        <button type="button" class="btn btn--icon site-open" title="Open HTTPS" aria-label="Open HTTPS"${site.enabled === false ? ' disabled' : ''}>${ICONS.external}</button>
        <button type="button" class="btn btn--ghost btn--sm site-remove">Remove</button>
      </div>
    `;

    li.querySelector('.site-fav')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void runActionClick(e, {
        key: `fav-${site.name}`,
        label: site.favorite ? 'Unfavorite site' : 'Favorite site',
        run: async () => {
          await window.devmgr.sitesActions.setFavorite(site.name, !site.favorite);
          await refresh();
        },
      });
    });

    li.querySelector('.site-copy')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void runActionClick(e, {
        key: `copy-${site.name}`,
        label: 'Copy URL',
        startToast: false,
        successMessage: 'URL copied',
        run: async () => {
          const btn = e.currentTarget;
          const ok = await copyText(url);
          if (!ok) throw new Error('Copy failed');
          btn.classList.toggle('is-copied', true);
          setTimeout(() => btn.classList.remove('is-copied'), 1200);
        },
      });
    });

    li.querySelector('.site-open')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void runActionClick(e, {
        key: `open-${site.name}`,
        label: 'Open site',
        successToast: false,
        run: () => openInExternalBrowser(url),
      });
    });

    li.querySelector('.site-remove')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !confirm(
          `Remove "${site.name}" from ${BRAND.name}? Your project files on disk are not deleted.`,
        )
      ) {
        return;
      }
      void runActionClick(e, {
        key: `remove-${site.name}`,
        label: 'Remove site',
        run: async () => {
          await window.devmgr.sitesActions.remove(site.name);
          if (detailSiteName === site.name) go('/sites');
          await refresh();
        },
      });
    });

    siteListEl.appendChild(li);
  }
}

async function renderSiteDetail(siteName) {
  if (!siteDetailRootEl) return;

  let detail;
  try {
    detail = await window.devmgr.site.detail(siteName);
  } catch {
    siteDetailRootEl.innerHTML = '<p class="empty">Site not found</p>';
    return;
  }

  const isLaravel = detail.framework === 'laravel';
  const laravelToolbar =
    isLaravel && detail.hasArtisan
      ? `
      ${iconBtn('btn-site-clear', ICONS.clear, 'Clear caches (optimize:clear)', false)}
      ${iconBtn('btn-site-optimize', ICONS.optimize, 'Optimize', false)}
      ${detail.laravelLogId ? iconBtn('btn-site-log', ICONS.log, 'Laravel log', false) : ''}
    `
      : '';

  siteDetailRootEl.innerHTML = `
    <header class="detail-head">
      <div>
        <h2>${escapeHtml(detail.hostname)}</h2>
        <p class="site-detail__subtitle">${escapeHtml(detail.name)} · ${escapeHtml(detail.framework)}</p>
      </div>
      <button type="button" class="btn btn--primary btn--sm site-open-url" data-open-url="${escapeHtml(detail.url)}" title="Open in default browser">
        ${ICONS.external}<span>Open site</span>
      </button>
    </header>
    <section class="detail-section site-detail">
      <h3>Project info</h3>
      <dl class="site-detail__info">
        <div class="site-detail__row"><dt>Name</dt><dd>${escapeHtml(detail.name)}</dd></div>
        <div class="site-detail__row"><dt>Hostname</dt><dd>${escapeHtml(detail.hostname)}</dd></div>
        <div class="site-detail__row"><dt>URL</dt><dd><button type="button" class="site-url-link" data-open-url="${escapeHtml(detail.url)}">${escapeHtml(detail.url)}</button></dd></div>
        <div class="site-detail__row"><dt>Framework</dt><dd>${escapeHtml(detail.framework)}</dd></div>
        <div class="site-detail__row"><dt>Project root</dt><dd class="mono">${escapeHtml(detail.root)}</dd></div>
        <div class="site-detail__row"><dt>Document root</dt><dd class="mono">${escapeHtml(detail.doc_root)}</dd></div>
        ${
          detail.envPath
            ? `<div class="site-detail__row"><dt>.env</dt><dd class="mono">${escapeHtml(detail.envPath)}</dd></div>`
            : ''
        }
        ${
          detail.laravelLogPath
            ? `<div class="site-detail__row"><dt>Laravel log</dt><dd class="mono">${escapeHtml(detail.laravelLogPath)}</dd></div>`
            : ''
        }
      </dl>
      <div class="site-detail__actions" data-site-actions>
        ${iconBtn('btn-site-explorer', ICONS.folder, 'Open folder in Explorer', false)}
        ${laravelToolbar}
      </div>
      <pre class="site-detail__output" hidden data-artisan-output></pre>
      <div class="site-detail__footer">
        <button type="button" class="btn btn--ghost btn--sm site-remove-detail">Remove from ${escapeHtml(BRAND.name)}</button>
      </div>
    </section>
  `;

  siteDetailRootEl.innerHTML += `
    <section class="detail-section site-config">
      <h3>Configuration</h3>
      <label class="settings-toggle">
        <input type="checkbox" id="site-enabled"${detail.enabled === false ? '' : ' checked'} />
        <span>Enabled (served by nginx and hosts file)</span>
      </label>
      <label class="settings-toggle">
        <input type="checkbox" id="site-favorite"${detail.favorite ? ' checked' : ''} />
        <span>Favorite (pinned to the top of the list)</span>
      </label>
      <form class="site-domain-form" id="site-domain-form">
        <label class="field">
          <span>Primary domain</span>
          <input type="text" name="domain" value="${escapeAttr(detail.hostname)}" placeholder="${escapeAttr(detail.defaultHostname)}" autocomplete="off" />
        </label>
        <label class="field">
          <span>Aliases (comma-separated)</span>
          <input type="text" name="aliases" value="${escapeAttr((detail.aliases ?? []).join(', '))}" placeholder="www.example.test, example.test" autocomplete="off" />
        </label>
        <div class="detail-actions">
          <button type="submit" class="btn btn--primary btn--sm">Save domain</button>
        </div>
        <p class="detail-hint">Saving updates the hosts file and certificate — Windows may prompt for permission.</p>
      </form>
      <p class="settings-status" id="site-config-status" hidden></p>
    </section>
  `;

  const root = siteDetailRootEl;
  bindExternalUrlLinks(root);

  root.querySelector('.btn-site-explorer')?.addEventListener('click', (e) =>
    runActionClick(e, {
      key: `explorer-${siteName}`,
      label: 'Open in Explorer',
      successToast: false,
      run: () => window.devmgr.site.openInExplorer(siteName),
    }),
  );

  root.querySelector('.btn-site-clear')?.addEventListener('click', (e) =>
    runSiteArtisan(siteName, ['optimize:clear'], root, e.currentTarget),
  );
  root.querySelector('.btn-site-optimize')?.addEventListener('click', (e) =>
    runSiteArtisan(siteName, ['optimize'], root, e.currentTarget),
  );
  root.querySelector('.btn-site-log')?.addEventListener('click', (e) =>
    runActionClick(e, {
      key: `site-log-${siteName}`,
      label: 'Open Laravel log',
      successToast: false,
      run: () => openSiteLog(siteName),
    }),
  );

  root.querySelector('.site-remove-detail')?.addEventListener('click', (e) => {
    if (
      !confirm(
        `Remove "${detail.name}" from ${BRAND.name}? Your project files on disk are not deleted.`,
      )
    ) {
      return;
    }
    void runActionClick(e, {
      key: `remove-detail-${detail.name}`,
      label: 'Remove site',
      run: async () => {
        await window.devmgr.sitesActions.remove(detail.name);
        go('/sites');
        await refresh();
      },
    });
  });

  const showCfgStatus = (text, ok) => {
    const el = root.querySelector('#site-config-status');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = `settings-status ${ok ? 'settings-status--ok' : 'settings-status--err'}`;
  };

  root.querySelector('#site-enabled')?.addEventListener('change', (e) => {
    const input = e.target;
    void runAction({
      key: `site-enabled-${siteName}`,
      label: input.checked ? 'Enable site' : 'Disable site',
      trigger: input,
      run: async () => {
        await window.devmgr.sitesActions.setEnabled(siteName, input.checked);
        await refresh();
        showCfgStatus(input.checked ? 'Site enabled.' : 'Site disabled.', true);
      },
    });
  });

  root.querySelector('#site-favorite')?.addEventListener('change', (e) => {
    const input = e.target;
    void runAction({
      key: `site-fav-detail-${siteName}`,
      label: input.checked ? 'Favorite site' : 'Unfavorite site',
      trigger: input,
      run: async () => {
        await window.devmgr.sitesActions.setFavorite(siteName, input.checked);
        await refresh();
      },
    });
  });

  root.querySelector('#site-domain-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const rawDomain = String(data.get('domain') ?? '').trim();
    const domain =
      !rawDomain || rawDomain.toLowerCase() === detail.defaultHostname.toLowerCase()
        ? null
        : rawDomain;
    const aliases = String(data.get('aliases') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    void runAction({
      key: `site-domain-${siteName}`,
      label: 'Save domain',
      trigger: submitBtn,
      run: async () => {
        await window.devmgr.sitesActions.setDomain(siteName, domain, aliases);
        await refresh();
        await renderSiteDetail(siteName);
        showCfgStatus('Domain saved.', true);
      },
    });
  });
}

function renderCatalog() {
  const bundled = state.status?.bundledServices ?? [];
  catalogGridEl.innerHTML = '';
  bundled.forEach((svc, index) => {
    const installed = svc.installed;
    const card = document.createElement('a');
    card.href = `#/services/${svc.id}`;
    card.className = 'catalog-card';
    card.style.setProperty('--stagger', String(index));
    card.innerHTML = `
      <h3>${escapeHtml(svc.name)}</h3>
      <p>${escapeHtml(svc.description)}</p>
      <span class="badge ${installed ? 'badge--installed' : 'badge--missing'}">${
        installed ? `v${escapeHtml(svc.installedVersion ?? '')}` : 'Not installed'
      }</span>
    `;
    catalogGridEl.appendChild(card);
  });
}

function settingsRuntimeToolbarHtml(serviceId) {
  const runtime = BUNDLED_RUNTIME[serviceId];
  if (!runtime) return '';

  const rt = runtimeStatus(runtime);
  const [badgeCls, badgeText] = badgeForRuntime(rt, serviceId);
  const isRunning = rt.state === 'running';

  return `
    <div class="detail-settings-runtime" data-detail-runtime>
      ${statusBadgeHtml(badgeCls, badgeText, { detail: true })}
      <div class="detail-runtime__actions">
        ${iconBtn('btn-start-one', ICONS.play, 'Start', isRunning, 'primary')}
        ${iconBtn('btn-stop-one', ICONS.stop, 'Stop', !isRunning, 'danger')}
        ${iconBtn('btn-log', ICONS.log, 'Open log', false)}
      </div>
    </div>
  `;
}

function wireSettingsRuntimeActions(serviceId) {
  const runtime = BUNDLED_RUNTIME[serviceId];
  const root = detailRootEl.querySelector('[data-detail-runtime]');
  if (!runtime || !root) return;

  root.querySelector('.btn-start-one')?.addEventListener('click', (e) =>
    runServiceAction(
      serviceId,
      runtime,
      () => startDetailService(serviceId),
      { captureError: true, trigger: e.currentTarget, verb: 'Start' },
    ),
  );
  root.querySelector('.btn-stop-one')?.addEventListener('click', (e) =>
    runServiceAction(serviceId, runtime, () => stopDetailService(serviceId), {
      captureError: true,
      trigger: e.currentTarget,
      verb: 'Stop',
    }),
  );
  root.querySelector('.btn-log')?.addEventListener('click', (e) =>
    runActionClick(e, {
      key: `log-${serviceId}`,
      label: 'Open log',
      successToast: false,
      run: () => openServiceLog(serviceId),
    }),
  );
}

function getDetailVersionSelect(serviceId) {
  return detailRootEl.querySelector(
    `[data-install-id="${serviceId}"] .version-select`,
  );
}

function getSelectedDetailVersion(serviceId, svc) {
  const select = getDetailVersionSelect(serviceId);
  if (select?.value) return select.value;
  return detailSelectedVersion || svc.installedVersion || '';
}

function getDetailInstallActionsEl(serviceId) {
  return detailRootEl.querySelector(
    `[data-install-id="${serviceId}"] .detail-install-actions`,
  );
}

function nginxSettingsPanelHtml() {
  return `
      <div class="detail-actions detail-actions--toolbar">
        <button type="button" class="btn btn--ghost" id="btn-open-nginx-conf">Open nginx.conf</button>
        <button type="button" class="btn btn--ghost" id="btn-open-nginx-http">Open devmgr-http.conf</button>
        <button type="button" class="btn btn--ghost" id="btn-nginx-restart">Restart nginx</button>
      </div>
      <p class="detail-hint">HTTP tuning is written to <code>devmgr-http.conf</code>; PHP timeouts apply to all site vhosts. Saving runs <strong>Re-apply</strong> and reloads nginx when it is running.</p>
      <form class="settings-form" id="nginx-settings-form"></form>
      <div class="detail-actions">
        <button type="button" class="btn btn--primary" id="btn-save-nginx">Save settings</button>
      </div>
  `;
}

function phpMyAdminSettingsPanelHtml() {
  return `
      <div class="detail-actions detail-actions--toolbar">
        <button type="button" class="btn btn--ghost" id="btn-open-pma-config">Open config.inc.php</button>
      </div>
      <p class="detail-hint" data-pma-url-hint></p>
      <p class="detail-hint">Saved to <code>config.toml</code> and <code>config.inc.php</code>. Import size uses <code>Max upload size</code> — keep it in line with nginx <strong>Max body size</strong> (e.g. both <code>512M</code> or nginx <code>0</code>). Saving runs <strong>Re-apply</strong>.</p>
      <form class="settings-form" id="pma-settings-form"></form>
      <div class="detail-actions">
        <button type="button" class="btn btn--primary" id="btn-save-pma">Save settings</button>
      </div>
  `;
}

function mysqlSettingsPanelHtml() {
  return `
      <div class="detail-actions detail-actions--toolbar">
        <button type="button" class="btn btn--ghost" id="btn-open-mysql-ini">Open my.ini</button>
        <button type="button" class="btn btn--ghost" id="btn-mysql-restart">Restart MySQL</button>
      </div>
      <p class="detail-hint">Common MariaDB settings — saved to config and written to <code>my.ini</code>. Restart MySQL after changing port or InnoDB options.</p>
      <form class="settings-form" id="mysql-settings-form"></form>
      <div class="detail-actions">
        <button type="button" class="btn btn--primary" id="btn-save-mysql">Save settings</button>
      </div>
  `;
}

function phpSettingsPanelHtml() {
  return `
      <div class="detail-actions detail-actions--toolbar">
        <button type="button" class="btn btn--ghost" id="btn-php-recommended">Enable recommended</button>
        <button type="button" class="btn btn--ghost" id="btn-open-ini">Open php.ini</button>
        <button type="button" class="btn btn--ghost" id="btn-php-restart">Restart PHP</button>
      </div>
      <div class="detail-tabs" role="tablist">
        <button type="button" class="detail-tabs__btn is-active" role="tab" data-php-tab="ini" aria-selected="true">php.ini</button>
        <button type="button" class="detail-tabs__btn" role="tab" data-php-tab="extensions" aria-selected="false">Extensions</button>
      </div>
      <div class="detail-tab-panel" data-php-panel="ini">
        <p class="detail-hint">Quick-edit common php.ini values for the selected version.</p>
        <form class="settings-form" id="php-settings-form"></form>
        <div class="detail-actions">
          <button type="button" class="btn btn--primary" id="btn-save-php">Save settings</button>
        </div>
      </div>
      <div class="detail-tab-panel" data-php-panel="extensions" hidden>
        <p class="detail-hint" data-php-ext-hint>Extensions for the selected PHP version.</p>
        <div id="php-extensions-root" class="php-extensions-root"></div>
      </div>
  `;
}

function ensurePhpSettingsDom() {
  const body = detailRootEl.querySelector('[data-settings-body]');
  if (!body || body.querySelector('#php-settings-form')) return;
  body.innerHTML = phpSettingsPanelHtml();
  wirePhpServiceSettings();
}

function ensureMysqlSettingsDom() {
  const body = detailRootEl.querySelector('[data-settings-body]');
  if (!body || body.querySelector('#mysql-settings-form')) return;
  body.innerHTML = mysqlSettingsPanelHtml();
  wireMysqlServiceSettings();
}

function ensurePhpMyAdminSettingsDom() {
  const body = detailRootEl.querySelector('[data-settings-body]');
  if (!body || body.querySelector('#pma-settings-form')) return;
  body.innerHTML = phpMyAdminSettingsPanelHtml();
  wirePhpMyAdminServiceSettings();
}

function ensureNginxSettingsDom() {
  const body = detailRootEl.querySelector('[data-settings-body]');
  if (!body || body.querySelector('#nginx-settings-form')) return;
  body.innerHTML = nginxSettingsPanelHtml();
  wireNginxServiceSettings();
}

async function buildVersionOptions(serviceId, svc) {
  const onDisk = new Set(await window.devmgr.services.installedVersions(serviceId));
  const active = svc.installedVersion ?? '';
  const selected = detailSelectedVersion ?? active;

  if (svc.versions.length === 0) {
    return '<option value="">No versions</option>';
  }

  return svc.versions
    .map((v) => {
      const isSelected = v.version === selected ? ' selected' : '';
      let suffix = '';
      if (onDisk.has(v.version)) {
        suffix = v.version === active ? ' · active' : ' · installed';
      }
      return `<option value="${escapeAttr(v.version)}"${isSelected}>${escapeHtml(v.label)}${escapeHtml(suffix)}</option>`;
    })
    .join('');
}

function updateDetailInstallActions(serviceId, svc, info) {
  const actions = getDetailInstallActionsEl(serviceId);
  if (!actions) return;

  const installing = busyServiceId === serviceId;
  const dis = installing ? ' disabled' : '';

  if (!info.installed) {
    actions.innerHTML = `<button type="button" class="btn btn--primary btn-install"${dis}>Install</button>`;
  } else {
    const updateBtn = `<button type="button" class="btn btn--ghost btn-update"${dis}>Update</button>`;
    const uninstallBtn = info.active
      ? `<button type="button" class="btn btn--ghost btn-uninstall"${dis}>Uninstall</button>`
      : '';
    actions.innerHTML = `${updateBtn}${uninstallBtn}`;
  }

  if (installing) setDetailInstallBusy(serviceId, true);
}

function updatePhpToolbarForVersion(installed) {
  for (const id of [
    'btn-php-recommended',
    'btn-open-ini',
    'btn-php-restart',
    'btn-save-php',
  ]) {
    const el = document.getElementById(id);
    if (el) el.disabled = !installed;
  }
}

function updateMysqlToolbarForVersion(installed) {
  for (const id of ['btn-open-mysql-ini', 'btn-mysql-restart', 'btn-save-mysql']) {
    const el = document.getElementById(id);
    if (el) el.disabled = !installed;
  }
}

function updatePhpMyAdminToolbarForVersion(installed) {
  for (const id of ['btn-open-pma-config', 'btn-save-pma']) {
    const el = document.getElementById(id);
    if (el) el.disabled = !installed;
  }
}

function updateNginxToolbarForVersion(installed) {
  for (const id of [
    'btn-open-nginx-conf',
    'btn-open-nginx-http',
    'btn-nginx-restart',
    'btn-save-nginx',
  ]) {
    const el = document.getElementById(id);
    if (el) el.disabled = !installed;
  }
}

async function handleDetailVersionChange(serviceId) {
  const svc = bundledById(serviceId);
  if (!svc) return;

  const version = getSelectedDetailVersion(serviceId, svc);
  detailSelectedVersion = version;
  const seq = ++detailVersionSeq;

  detailOnDiskVersions = await window.devmgr.services.installedVersions(serviceId);
  if (seq !== detailVersionSeq) return;

  const onDisk = detailOnDiskVersions.includes(version);
  updateDetailInstallActions(serviceId, svc, {
    installed: onDisk,
    active: Boolean(svc.installed && svc.installedVersion === version),
    version,
    path: '',
  });

  const label = detailRootEl.querySelector('[data-settings-version-label]');
  const emptyEl = detailRootEl.querySelector('[data-settings-empty]');
  const bodyEl = detailRootEl.querySelector('[data-settings-body]');
  if (!bodyEl) return;

  const info = await window.devmgr.services.versionInfo(serviceId, version);
  if (seq !== detailVersionSeq) return;

  const freshSvc = bundledById(serviceId) ?? svc;
  updateDetailInstallActions(serviceId, freshSvc, info);
  if (serviceId === 'php') updatePhpToolbarForVersion(info.installed);
  if (serviceId === 'mysql') updateMysqlToolbarForVersion(info.installed);
  if (serviceId === 'phpmyadmin') updatePhpMyAdminToolbarForVersion(info.installed);
  if (serviceId === 'nginx') updateNginxToolbarForVersion(info.installed);

  if (label) {
    if (!info.installed) {
      label.textContent = `Version ${version} is not installed. Install it above to edit settings.`;
    } else if (info.active) {
      label.textContent = `Settings for ${version} (active — used when the service runs)`;
    } else {
      label.textContent = `Settings for ${version} (installed on disk, not the active default)`;
    }
  }

  if (!info.installed) {
    if (emptyEl) emptyEl.hidden = false;
    bodyEl.hidden = true;
    if (seq === detailVersionSeq) await updateDetailRuntimeUI(serviceId);
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  bodyEl.hidden = false;

  if (serviceId === 'php') {
    ensurePhpSettingsDom();
    await loadPhpSettingsForm(version);
    const extTab = detailRootEl.querySelector('[data-php-panel="extensions"]');
    if (extTab && !extTab.hidden) {
      await loadPhpExtensionsPanel(version);
    }
    const extHint = detailRootEl.querySelector('[data-php-ext-hint]');
    if (extHint) extHint.textContent = `Extensions in php.ini for PHP ${version}.`;
  } else if (serviceId === 'mysql') {
    ensureMysqlSettingsDom();
    await loadMysqlSettingsForm(version);
  } else if (serviceId === 'phpmyadmin') {
    ensurePhpMyAdminSettingsDom();
    await loadPhpMyAdminSettingsForm(version);
  } else if (serviceId === 'nginx') {
    ensureNginxSettingsDom();
    await loadNginxSettingsForm(version);
  } else {
    bodyEl.innerHTML = `
      <table class="cfg-table">
        <tbody>
          <tr><th>version</th><td>${escapeHtml(version)}</td></tr>
          <tr><th>path</th><td>${escapeHtml(info.path)}</td></tr>
          <tr><th>active</th><td>${info.active ? 'yes' : 'no'}</td></tr>
        </tbody>
      </table>
    `;
  }

  if (seq === detailVersionSeq) await updateDetailRuntimeUI(serviceId);
}

async function renderServiceDetail(serviceId) {
  const svc = bundledById(serviceId);
  if (!svc) {
    detailRootEl.innerHTML = '<p class="empty">Unknown service</p>';
    return;
  }

  const installed = svc.installed;
  const headBadgeCls = installed ? 'badge--installed' : 'badge--missing';
  const headBadgeText = installed ? `v${svc.installedVersion ?? ''}` : 'Not installed';
  const versionOptions = await buildVersionOptions(serviceId, svc);

  const settingsBodyInitial =
    serviceId === 'php'
      ? phpSettingsPanelHtml()
      : serviceId === 'mysql'
        ? mysqlSettingsPanelHtml()
        : serviceId === 'phpmyadmin'
          ? phpMyAdminSettingsPanelHtml()
          : serviceId === 'nginx'
            ? nginxSettingsPanelHtml()
            : '';

  const settingsBlock =
    installed || svc.versions.length > 0
      ? `
      <section class="detail-section detail-section--settings">
        <div class="detail-settings-head">
          <h3>Settings</h3>
          ${settingsRuntimeToolbarHtml(serviceId)}
        </div>
        <p class="detail-hint" data-settings-version-label></p>
        <div data-settings-panel>
          <p class="empty" data-settings-empty hidden>Install this version to view and edit settings.</p>
          <div data-settings-body>${settingsBodyInitial}</div>
        </div>
      </section>
    `
      : '';

  detailRootEl.innerHTML = `
    <header class="detail-head">
      <div>
        <h2>${svc.name}</h2>
        <p>${svc.description}</p>
      </div>
      <span class="badge ${headBadgeCls}">${escapeHtml(headBadgeText)}</span>
    </header>
    <section class="detail-section" data-install-id="${serviceId}">
      <h3>Install &amp; versions</h3>
      <div class="detail-actions">
        <select class="select version-select">${versionOptions}</select>
        <div class="detail-install-actions"></div>
      </div>
      <div class="progress">
        <div class="progress__track"><div class="progress__bar"></div></div>
        <p class="progress__label"></p>
      </div>
    </section>
    ${settingsBlock}
  `;

  detailOnDiskVersions = await window.devmgr.services.installedVersions(serviceId);

  wireSettingsRuntimeActions(serviceId);

  if (serviceId === 'php') {
    wirePhpServiceSettings();
  }
  if (serviceId === 'mysql') {
    wireMysqlServiceSettings();
  }
  if (serviceId === 'phpmyadmin') {
    wirePhpMyAdminServiceSettings();
  }
  if (serviceId === 'nginx') {
    wireNginxServiceSettings();
  }

  await handleDetailVersionChange(serviceId);
}

function nginxApi() {
  const api = window.devmgr?.nginx;
  if (!api?.saveSettings) {
    throw new Error('nginx API unavailable — quit the app, run npm run build, then npm start');
  }
  return api;
}

function phpMyAdminApi() {
  const api = window.devmgr?.phpmyadmin;
  if (!api?.saveSettings) {
    throw new Error('phpMyAdmin API unavailable — quit the app, run npm run build, then npm start');
  }
  return api;
}

function mysqlApi() {
  const api = window.devmgr?.mysql;
  if (!api?.saveSettings) {
    throw new Error('MySQL API unavailable — quit the app, run npm run build, then npm start');
  }
  return api;
}

function wireNginxServiceSettings() {
  document.getElementById('btn-open-nginx-conf')?.addEventListener('click', (e) => {
    const svc = bundledById(detailServiceId);
    const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
    void runActionClick(e, {
      key: 'open-nginx-conf',
      label: 'Open nginx.conf',
      successToast: false,
      run: async () => {
        await nginxApi().openConf(version || undefined);
        toast.success('nginx.conf opened');
      },
    });
  });
  document.getElementById('btn-open-nginx-http')?.addEventListener('click', (e) => {
    const svc = bundledById(detailServiceId);
    const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
    void runActionClick(e, {
      key: 'open-nginx-http-conf',
      label: 'Open HTTP tuning',
      successToast: false,
      run: async () => {
        const data = await nginxApi().getSettings(version || undefined);
        if (!data?.httpConfPath) throw new Error('devmgr-http.conf not found');
        await window.devmgr.settings.openPath(data.httpConfPath);
        toast.success('devmgr-http.conf opened');
      },
    });
  });
  document.getElementById('btn-save-nginx')?.addEventListener('click', (e) => void saveNginxSettings(e));
  document.getElementById('btn-nginx-restart')?.addEventListener('click', (e) => void restartNginxService(e));
}

async function loadNginxSettingsForm(version) {
  const form = document.getElementById('nginx-settings-form');
  const data = await nginxApi().getSettings(version);
  if (!form) return;
  if (!data) {
    form.innerHTML = '<p class="empty">nginx.conf not found for this build.</p>';
    return;
  }
  const values = { port: data.port, ssl_port: data.ssl_port, ...data.settings };
  form.innerHTML = NGINX_QUICK_FIELDS.map((f) => {
    if (f.type === 'checkbox') {
      const checked = values[f.key] ? ' checked' : '';
      return `
    <label class="settings-toggle">
      <input type="checkbox" name="${f.key}"${checked} />
      <span>${f.label}</span>
    </label>`;
    }
    const inputType = f.type === 'number' ? 'number' : 'text';
    return `
    <label class="field field--inline">
      <span>${f.label}</span>
      <input type="${inputType}" name="${f.key}" value="${escapeAttr(String(values[f.key] ?? ''))}" />
    </label>`;
  }).join('');
  form.dataset.configPath = data.configPath;
  form.dataset.httpConfPath = data.httpConfPath;
}

async function saveNginxSettings(e) {
  const form = document.getElementById('nginx-settings-form');
  if (!form) return;
  const svc = bundledById(detailServiceId);
  const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
  const patch = {};
  for (const f of NGINX_QUICK_FIELDS) {
    if (f.type === 'checkbox') {
      patch[f.key] = Boolean(form.querySelector(`[name="${f.key}"]`)?.checked);
      continue;
    }
    const input = form.querySelector(`[name="${f.key}"]`);
    if (!input?.value && input?.value !== '0') continue;
    if (f.type === 'number') {
      patch[f.key] = Number(input.value);
    } else {
      patch[f.key] = input.value;
    }
  }
  const trigger = e?.currentTarget ?? document.getElementById('btn-save-nginx');
  await runAction({
    key: 'nginx-save-settings',
    label: 'Save nginx settings',
    trigger,
    run: async () => {
      await nginxApi().saveSettings(patch, version);
      await loadNginxSettingsForm(version);
      toast.info('Restart nginx and PHP so upload limits take effect');
    },
  });
}

async function restartNginxService(e) {
  await runActionClick(e, {
    key: 'nginx-restart',
    label: 'Restart nginx',
    run: async () => {
      await nginxApi().restart();
      await refresh();
    },
  });
}

function wirePhpMyAdminServiceSettings() {
  document.getElementById('btn-open-pma-config')?.addEventListener('click', (e) => {
    const svc = bundledById(detailServiceId);
    const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
    void runActionClick(e, {
      key: 'open-pma-config',
      label: 'Open config.inc.php',
      successToast: false,
      run: async () => {
        await phpMyAdminApi().openConfig(version || undefined);
        toast.success('config.inc.php opened');
      },
    });
  });
  document.getElementById('btn-save-pma')?.addEventListener('click', (e) => void savePhpMyAdminSettings(e));
}

async function loadPhpMyAdminSettingsForm(version) {
  const form = document.getElementById('pma-settings-form');
  const data = await phpMyAdminApi().getSettings(version);
  const hint = detailRootEl.querySelector('[data-pma-url-hint]');
  if (!form) return;
  if (!data) {
    form.innerHTML = '<p class="empty">config.inc.php not found for this phpMyAdmin build.</p>';
    if (hint) hint.textContent = '';
    return;
  }
  const values = { hostname: data.hostname, ...data.settings };
  if (hint) {
    hint.innerHTML = `Site URL: <button type="button" class="site-url-link" data-open-url="${escapeAttr(data.url)}">${escapeHtml(data.url)}</button>`;
    bindExternalUrlLinks(hint);
  }
  form.innerHTML = PMA_QUICK_FIELDS.map((f) => {
    if (f.type === 'checkbox') {
      const checked = values[f.key] ? ' checked' : '';
      return `
    <label class="settings-toggle">
      <input type="checkbox" name="${f.key}"${checked} />
      <span>${f.label}</span>
    </label>`;
    }
    if (f.type === 'select') {
      const opts = (f.options ?? [])
        .map(
          (o) =>
            `<option value="${escapeAttr(o.value)}"${values[f.key] === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
        )
        .join('');
      return `
    <label class="field field--inline">
      <span>${f.label}</span>
      <select name="${f.key}" class="select">${opts}</select>
    </label>`;
    }
    const inputType = f.type === 'number' ? 'number' : 'text';
    return `
    <label class="field field--inline">
      <span>${f.label}</span>
      <input type="${inputType}" name="${f.key}" value="${escapeAttr(String(values[f.key] ?? ''))}" />
    </label>`;
  }).join('');
  form.dataset.configPath = data.configPath;
}

async function savePhpMyAdminSettings(e) {
  const form = document.getElementById('pma-settings-form');
  if (!form) return;
  const svc = bundledById(detailServiceId);
  const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
  const patch = {};
  for (const f of PMA_QUICK_FIELDS) {
    if (f.type === 'checkbox') {
      patch[f.key] = Boolean(form.querySelector(`[name="${f.key}"]`)?.checked);
      continue;
    }
    const input = form.querySelector(`[name="${f.key}"]`);
    if (!input) continue;
    if (f.type === 'number') {
      if (input.value === '') continue;
      patch[f.key] = Number(input.value);
    } else {
      if (input.value === '') continue;
      patch[f.key] = input.value;
    }
  }
  const trigger = e?.currentTarget ?? document.getElementById('btn-save-pma');
  await runAction({
    key: 'pma-save-settings',
    label: 'Save phpMyAdmin settings',
    trigger,
    run: async () => {
      await phpMyAdminApi().saveSettings(patch, version);
      await loadPhpMyAdminSettingsForm(version);
    },
  });
}

function wireMysqlServiceSettings() {
  document.getElementById('btn-open-mysql-ini')?.addEventListener('click', (e) => {
    const svc = bundledById(detailServiceId);
    const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
    void runActionClick(e, {
      key: 'open-mysql-ini',
      label: 'Open my.ini',
      successToast: false,
      run: async () => {
        await mysqlApi().openIni(version || undefined);
        toast.success('my.ini opened');
      },
    });
  });
  document.getElementById('btn-save-mysql')?.addEventListener('click', (e) => void saveMysqlSettings(e));
  document.getElementById('btn-mysql-restart')?.addEventListener('click', (e) => void restartMysqlService(e));
}

async function loadMysqlSettingsForm(version) {
  const form = document.getElementById('mysql-settings-form');
  const data = await mysqlApi().getSettings(version);
  if (!form) return;
  if (!data) {
    form.innerHTML = '<p class="empty">my.ini not found for this MariaDB build.</p>';
    return;
  }
  const values = { port: data.port, ...data.settings };
  form.innerHTML = MYSQL_QUICK_FIELDS.map((f) => {
    if (f.type === 'checkbox') {
      const checked = values[f.key] ? ' checked' : '';
      return `
    <label class="settings-toggle">
      <input type="checkbox" name="${f.key}"${checked} />
      <span>${f.label}</span>
    </label>`;
    }
    const inputType = f.type === 'number' ? 'number' : 'text';
    return `
    <label class="field field--inline">
      <span>${f.label}</span>
      <input type="${inputType}" name="${f.key}" value="${escapeAttr(String(values[f.key] ?? ''))}" />
    </label>`;
  }).join('');
  form.dataset.iniPath = data.iniPath;
}

async function saveMysqlSettings(e) {
  const form = document.getElementById('mysql-settings-form');
  if (!form) return;
  const svc = bundledById(detailServiceId);
  const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
  const patch = {};
  for (const f of MYSQL_QUICK_FIELDS) {
    if (f.type === 'checkbox') {
      patch[f.key] = Boolean(form.querySelector(`[name="${f.key}"]`)?.checked);
      continue;
    }
    const input = form.querySelector(`[name="${f.key}"]`);
    if (!input?.value && input?.value !== '0') continue;
    if (f.type === 'number') {
      patch[f.key] = Number(input.value);
    } else {
      patch[f.key] = input.value;
    }
  }
  const trigger = e?.currentTarget ?? document.getElementById('btn-save-mysql');
  await runAction({
    key: 'mysql-save-settings',
    label: 'Save MySQL settings',
    trigger,
    run: async () => {
      await mysqlApi().saveSettings(patch, version);
      await loadMysqlSettingsForm(version);
      toast.info('Restart MySQL if the server was running');
    },
  });
}

async function restartMysqlService(e) {
  await runActionClick(e, {
    key: 'mysql-restart',
    label: 'Restart MySQL',
    run: async () => {
      await mysqlApi().restart();
      await refresh();
    },
  });
}

function wirePhpServiceSettings() {
  document.getElementById('btn-open-ini')?.addEventListener('click', (e) => {
    const svc = bundledById(detailServiceId);
    const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
    void runActionClick(e, {
      key: 'open-php-ini',
      label: 'Open php.ini',
      successToast: false,
      run: async () => {
        await window.devmgr.php.openIni(version || undefined);
        toast.success('php.ini opened');
      },
    });
  });
  document.getElementById('btn-save-php')?.addEventListener('click', (e) => void savePhpSettings(e));
  document.getElementById('btn-php-recommended')?.addEventListener('click', (e) =>
    void enableRecommendedPhpExtensions(e),
  );
  document.getElementById('btn-php-restart')?.addEventListener('click', (e) => void restartPhpService(e));

  detailRootEl.querySelectorAll('[data-php-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchPhpTab(btn.getAttribute('data-php-tab')));
  });
}

function switchPhpTab(tab) {
  detailRootEl.querySelectorAll('[data-php-tab]').forEach((btn) => {
    const active = btn.getAttribute('data-php-tab') === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  detailRootEl.querySelectorAll('[data-php-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-php-panel') !== tab;
  });
  if (tab === 'extensions') {
    const svc = bundledById(detailServiceId);
    const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
    void loadPhpExtensionsPanel(version);
  }
}

async function loadPhpSettingsForm(version) {
  const form = document.getElementById('php-settings-form');
  const data = await window.devmgr.php.getSettings(version);
  if (!form) return;
  if (!data) {
    form.innerHTML = '<p class="empty">php.ini not found for this PHP build.</p>';
    return;
  }
  form.innerHTML = PHP_QUICK_FIELDS.map(
    (f) => `
    <label class="field field--inline">
      <span>${f.label}</span>
      <input type="text" name="${f.key}" value="${escapeAttr(data.settings[f.key] ?? '')}" />
    </label>
  `,
  ).join('');
  form.dataset.iniPath = data.iniPath;
}

async function savePhpSettings(e) {
  const form = document.getElementById('php-settings-form');
  if (!form) return;
  const svc = bundledById(detailServiceId);
  const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
  const patch = {};
  for (const f of PHP_QUICK_FIELDS) {
    const input = form.querySelector(`[name="${f.key}"]`);
    if (input?.value) patch[f.key] = input.value;
  }
  const trigger = e?.currentTarget ?? document.getElementById('btn-save-php');
  await runAction({
    key: 'php-save-settings',
    label: 'Save PHP settings',
    trigger,
    run: async () => {
      await window.devmgr.php.saveSettings(patch, version);
      await loadPhpSettingsForm(version);
    },
  });
}

async function loadPhpExtensionsPanel(version) {
  const root = document.getElementById('php-extensions-root');
  if (!root) return;

  root.innerHTML = '<p class="empty">Loading extensions…</p>';
  const [data, pecl] = await Promise.all([
    window.devmgr.php.extensions(version),
    window.devmgr.php.peclInstallable(version),
  ]);
  if (!data) {
    root.innerHTML = '<p class="empty">php.ini not found for this PHP build.</p>';
    return;
  }

  const installedRows =
    data.extensions.length === 0
      ? '<tr><td colspan="3" class="empty">No DLLs in the ext folder yet.</td></tr>'
      : data.extensions
          .map((ext) => {
            const statusClass = ext.enabled ? 'badge--installed' : 'badge--missing';
            const statusLabel = ext.enabled ? 'Enabled' : 'Disabled';
            const rec = ext.recommended
              ? '<span class="badge badge--rec">recommended</span>'
              : '';
            return `
        <tr data-ext="${escapeAttr(ext.name)}">
          <td class="ext-table__name"><code>${escapeHtml(ext.name)}</code> ${rec}</td>
          <td><span class="badge ${statusClass}">${statusLabel}</span></td>
          <td class="ext-table__actions">
            <button type="button" class="btn btn--ghost btn-ext-enable" data-name="${escapeAttr(ext.name)}"${ext.enabled ? ' disabled' : ''}>Enable</button>
            <button type="button" class="btn btn--ghost btn-ext-disable" data-name="${escapeAttr(ext.name)}"${ext.enabled ? '' : ' disabled'}>Disable</button>
          </td>
        </tr>
      `;
          })
          .join('');

  const buildHint = pecl?.build
    ? `<p class="detail-hint">PECL downloads match PHP <code>${escapeHtml(pecl.build.version)}</code> (<code>${escapeHtml(pecl.build.variantKey)}</code>${pecl.build.zendModuleApi ? `, API ${escapeHtml(pecl.build.zendModuleApi)}` : ''}).</p>`
    : '';

  const peclRows = (pecl?.packages ?? [])
    .map((pkg) => {
      const status = pkg.dllPresent
        ? pkg.enabled
          ? '<span class="badge badge--installed">Installed · on</span>'
          : '<span class="badge badge--missing">Installed · off</span>'
        : '<span class="badge badge--missing">Not installed</span>';
      let actionCell = '—';
      if (pkg.dllPresent && pkg.enabled) {
        actionCell = '<span class="detail-hint">Ready</span>';
      } else if (pkg.dllPresent && !pkg.enabled) {
        actionCell = `<button type="button" class="btn btn--ghost btn-pecl-action" data-ini="${escapeAttr(pkg.iniName)}" data-action="enable">Enable</button>`;
      } else {
        actionCell = `<button type="button" class="btn btn--primary btn-pecl-action" data-pecl="${escapeAttr(pkg.peclName)}" data-action="install">Install</button>`;
      }
      return `
        <tr data-pecl="${escapeAttr(pkg.peclName)}">
          <td class="ext-table__name"><code>${escapeHtml(pkg.iniName)}</code> <span class="ext-table__sub">${escapeHtml(pkg.label)}</span></td>
          <td>${status}</td>
          <td class="ext-table__actions">${actionCell}</td>
        </tr>
      `;
    })
    .join('');

  root.innerHTML = `
    <h4 class="ext-section-title">Bundled extensions</h4>
    <table class="ext-table">
      <thead>
        <tr><th>Extension</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>${installedRows}</tbody>
    </table>
    <h4 class="ext-section-title">Install from PECL (Windows)</h4>
    ${buildHint}
    <table class="ext-table">
      <thead>
        <tr><th>Package</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>${peclRows}</tbody>
    </table>
    <p class="detail-hint">After installing or enabling extensions, use <strong>Restart PHP</strong>.</p>
  `;

  root.querySelectorAll('.btn-ext-enable').forEach((btn) => {
    btn.addEventListener('click', (e) =>
      setPhpExtension(btn.getAttribute('data-name'), true, e.currentTarget),
    );
  });
  root.querySelectorAll('.btn-ext-disable').forEach((btn) => {
    btn.addEventListener('click', (e) =>
      setPhpExtension(btn.getAttribute('data-name'), false, e.currentTarget),
    );
  });
  root.querySelectorAll('.btn-pecl-action').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const action = btn.getAttribute('data-action');
      if (action === 'enable') {
        const iniName = btn.getAttribute('data-ini');
        if (iniName) void setPhpExtension(iniName, true);
        return;
      }
      const peclName = btn.getAttribute('data-pecl');
      if (peclName) void installPeclExtension(peclName, e.currentTarget);
    });
  });
}

async function installPeclExtension(peclName, trigger = null) {
  const svc = bundledById(detailServiceId);
  const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
  await runAction({
    key: `php-pecl-${peclName}`,
    label: `Install ${peclName}`,
    trigger,
    global: true,
    run: async () => {
      const root = document.getElementById('php-extensions-root');
      if (root) {
        root.querySelectorAll('.btn-pecl-action').forEach((b) => {
          b.disabled = true;
        });
      }
      await window.devmgr.php.installPecl(peclName, version);
      await loadPhpExtensionsPanel(version);
      if (confirm('Extension installed. Restart PHP now?')) {
        await restartPhpService();
      }
    },
  });
}

async function setPhpExtension(name, enabled, trigger = null) {
  if (!name) return;
  const svc = bundledById(detailServiceId);
  const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
  await runAction({
    key: `php-ext-${name}-${enabled}`,
    label: enabled ? `Enable ${name}` : `Disable ${name}`,
    trigger,
    run: async () => {
      await window.devmgr.php.setExtension(name, enabled, version);
      await loadPhpExtensionsPanel(version);
    },
  });
}

async function enableRecommendedPhpExtensions(e) {
  const svc = bundledById(detailServiceId);
  const version = svc ? getSelectedDetailVersion(detailServiceId, svc) : undefined;
  await runAction({
    key: 'php-ext-recommended',
    label: 'Enable recommended extensions',
    trigger: e?.currentTarget ?? document.getElementById('btn-php-recommended'),
    run: async () => {
      await window.devmgr.php.enableRecommended(version);
      await loadPhpExtensionsPanel(version);
      switchPhpTab('extensions');
    },
  });
}

async function restartPhpService(e) {
  await runAction({
    key: 'php-restart',
    label: 'Restart PHP',
    trigger: e?.currentTarget ?? document.getElementById('btn-php-restart'),
    run: async () => {
      await ensureSelectedVersionActive('php');
      await window.devmgr.php.restart();
      await refreshDetailStatus();
    },
  });
}

function escapeAttr(s) {
  return escapeHtml(s);
}

async function runInstallAction(serviceId, fn, trigger = null) {
  if (busyServiceId) return;
  const svc = bundledById(serviceId);
  busyServiceId = serviceId;
  setDetailInstallBusy(serviceId, true);
  await runAction({
    key: `install-${serviceId}`,
    label: `Install ${svc?.name ?? serviceId}`,
    trigger,
    successToast: false,
    run: async () => {
      try {
        await fn();
      } catch (err) {
        const msg = err.message ?? String(err);
        updateInstallProgress({
          serviceId,
          version: '',
          phase: 'error',
          percent: 0,
          message: msg,
        });
        busyServiceId = null;
        setDetailInstallBusy(serviceId, false);
        throw err;
      }
    },
  });
}

async function refresh() {
  const route = parseRoute();
  lastDashboardSnapshot = '';
  state.status = await window.devmgr.status();
  state.config = await window.devmgr.config();

  const siteCount = state.status?.sites?.length ?? 0;
  if (sitesSummaryCountEl) sitesSummaryCountEl.textContent = String(siteCount);
  if (sitesSummaryEl) {
    sitesSummaryEl.textContent =
      siteCount === 0 ? 'No projects yet' : siteCount === 1 ? 'Project' : 'Projects';
  }

  updateTopbarFromStatus();

  if (route.page === 'dashboard') {
    try {
      renderDashboard({ force: true });
      renderDashboardWarnings();
      renderDashboardAlert();
    } catch (err) {
      dashboardEl.innerHTML = `<p class="empty dashboard-render-error">${escapeHtml(err?.message ?? String(err))}</p>`;
    }
  }

  if (route.page === 'sites') {
    renderSites();
  }
  if (route.page === 'services') {
    renderCatalog();
  }
  if (route.page === 'dashboard' || route.page === 'settings') {
    await renderPhpBar();
  }

  if (detailServiceId && route.page === 'service-detail') {
    void renderServiceDetail(detailServiceId);
  }
  if (detailSiteName && route.page === 'site-detail') {
    void renderSiteDetail(detailSiteName);
  }
  if (route.page === 'logs') {
    void renderLogsPage();
  }
  if (route.page === 'settings') {
    void renderSettingsPage();
  }
}

phpSelectEl?.addEventListener('change', () => {
  void runAction({
    key: 'php-default',
    label: 'Set default PHP',
    trigger: phpSelectEl,
    global: true,
    run: async () => {
      await window.devmgr.php.setDefault(phpSelectEl.value);
      try {
        await window.devmgr.env.sync();
      } catch {
        // PATH sync is best-effort
      }
      await refresh();
    },
  });
});

document.getElementById('btn-sync-hosts')?.addEventListener('click', (e) => {
  void runActionClick(e, {
    key: 'hosts-sync',
    label: 'Sync hosts',
    global: true,
    successToast: false,
    run: async () => {
      const result = await window.devmgr.hosts.sync();
      if (result.skipped) {
        toast.info('Hosts file already has all site entries.');
      } else {
        toast.success(
          `Hosts updated (${result.missing.length} missing entr${result.missing.length === 1 ? 'y' : 'ies'} added).`,
        );
      }
      await refresh();
    },
  });
});

document.getElementById('btn-apply')?.addEventListener('click', (e) => {
  void runActionClick(e, {
    key: 'apply',
    label: 'Re-apply configs',
    global: true,
    run: async () => {
      await window.devmgr.apply();
      await refresh();
    },
  });
});

document.getElementById('btn-start-all')?.addEventListener('click', (e) => {
  void runActionClick(e, {
    key: 'start-all',
    label: 'Start all services',
    global: true,
    run: async () => {
      dashboardGlobalError = null;
      try {
        await window.devmgr.start();
      } catch (err) {
        dashboardGlobalError = err?.message ?? String(err);
        throw err;
      }
      await refresh();
    },
  });
});

document.getElementById('btn-stop-all')?.addEventListener('click', (e) => {
  void runActionClick(e, {
    key: 'stop-all',
    label: 'Stop all services',
    global: true,
    run: async () => {
      dashboardGlobalError = null;
      rowErrors.clear();
      await window.devmgr.stop();
      await refresh();
    },
  });
});

document.getElementById('btn-service-back')?.addEventListener('click', (e) => {
  e.preventDefault();
  go('/services');
});

document.getElementById('btn-site-back')?.addEventListener('click', (e) => {
  e.preventDefault();
  go('/sites');
});

btnLogsPopout?.addEventListener('click', (e) => {
  const id = btnLogsPopout.dataset.logId;
  const label = btnLogsPopout.dataset.logLabel ?? 'Log';
  if (!id) return;
  void runActionClick(e, {
    key: `log-popout-${id}`,
    label: 'Open log window',
    successToast: false,
    run: () => window.devmgr.logs.open(id, label),
  });
});

document.getElementById('btn-refresh-catalog')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const prevText = btn.textContent;
  void runActionClick(e, {
    key: 'catalog-refresh',
    label: 'Refresh catalog',
    run: async () => {
      btn.textContent = 'Refreshing…';
      try {
        await window.devmgr.services.refresh();
        await refresh();
      } finally {
        btn.textContent = prevText;
      }
    },
  });
});

const modalLaravel = document.getElementById('modal-laravel');
const modalLink = document.getElementById('modal-link');
const modalClone = document.getElementById('modal-clone');

const siteSearchEl = document.getElementById('site-search');
siteSearchEl?.addEventListener('input', () => {
  siteSearchQuery = siteSearchEl.value;
  if (parseRoute().page === 'sites') renderSites();
});

document.getElementById('btn-new-laravel')?.addEventListener('click', () => {
  modalLaravel.showModal();
});

document.getElementById('btn-link-project')?.addEventListener('click', (e) => {
  void runActionClick(e, {
    key: 'pick-link-dir',
    label: 'Choose project folder',
    successToast: false,
    run: async () => {
      linkSourcePath = await window.devmgr.dialog.pickDirectory();
      if (!linkSourcePath) return;
      document.getElementById('link-source-hint').textContent = linkSourcePath;
      modalLink.showModal();
      toast.success('Folder selected');
    },
  });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog')?.close());
});

document.getElementById('btn-clone-git')?.addEventListener('click', () => {
  modalClone?.showModal();
});

document.getElementById('form-clone')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const url = String(data.get('url') ?? '').trim();
  const name = String(data.get('name') ?? '').trim();
  if (!url) return;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  void runAction({
    key: 'site-clone',
    label: 'Clone project',
    trigger: submitBtn,
    global: true,
    run: async () => {
      modalClone?.close();
      await window.devmgr.sitesActions.cloneGit(url, name || undefined);
      await refresh();
      go('/sites');
    },
  });
});

document.getElementById('form-laravel')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = new FormData(e.target).get('name');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  void runAction({
    key: 'site-laravel',
    label: 'New Laravel project',
    trigger: submitBtn,
    global: true,
    run: async () => {
      modalLaravel.close();
      await window.devmgr.sitesActions.createLaravel(String(name));
      await refresh();
      go('/sites');
    },
  });
});

document.getElementById('form-link')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!linkSourcePath) return;
  const name = new FormData(e.target).get('name');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  void runAction({
    key: 'site-link',
    label: 'Link project',
    trigger: submitBtn,
    global: true,
    run: async () => {
      modalLink.close();
      await window.devmgr.sitesActions.linkExisting(
        linkSourcePath,
        name ? String(name) : undefined,
      );
      linkSourcePath = null;
      await refresh();
      go('/sites');
    },
  });
});

if (detailPageEl) {
  detailPageEl.addEventListener('change', (e) => {
    if (!detailServiceId) return;
    const select = e.target;
    if (
      select?.classList?.contains('version-select') &&
      select.closest(`[data-install-id="${detailServiceId}"]`)
    ) {
      void handleDetailVersionChange(detailServiceId);
    }
  });

  detailPageEl.addEventListener('click', (e) => {
    if (!detailServiceId) return;
    const root = e.target.closest(`[data-install-id="${detailServiceId}"]`);
    if (!root) return;

    const select = root.querySelector('.version-select');
    const svc = bundledById(detailServiceId);
    if (!svc || !select) return;

    const actionBtn = e.target.closest('.btn-install, .btn-update, .btn-uninstall');
    if (e.target.closest('.btn-install')) {
      void runInstallAction(
        detailServiceId,
        () => window.devmgr.services.install(detailServiceId, select.value),
        actionBtn,
      );
      return;
    }
    if (e.target.closest('.btn-update')) {
      void runInstallAction(
        detailServiceId,
        () => {
          const fresh = bundledById(detailServiceId);
          if (select.value === fresh?.installedVersion) {
            throw new Error('Select a different version to update');
          }
          return window.devmgr.services.update(detailServiceId, select.value);
        },
        actionBtn,
      );
      return;
    }
    if (e.target.closest('.btn-uninstall')) {
      if (!confirm(`Remove ${svc.name} and delete its files?`)) return;
      void runInstallAction(
        detailServiceId,
        () => window.devmgr.services.uninstall(detailServiceId),
        actionBtn,
      );
    }
  });
}

async function boot() {
  closeAllModals();
  wireNavigation();
  wireWindowChrome();

  if (!window.devmgr) {
    showBootError(new Error('Preload did not expose window.devmgr'));
    return;
  }

  window.devmgr.services.onInstallProgress((progress) => {
    updateInstallProgress(progress);
  });

  wireBootstrap();
  navigate();
  try {
    await refresh();
  } catch (err) {
    if (sitesSummaryCountEl) sitesSummaryCountEl.textContent = '!';
    if (sitesSummaryEl) sitesSummaryEl.textContent = `Error: ${err.message}`;
    showBootError(err);
  }
}

boot();
