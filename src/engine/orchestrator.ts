import fs from 'fs';
import path from 'path';
import {
  applyManifestToConfig,
  applyRuntimeToBundledStatus,
  buildBundledStatus,
  installService,
  readManifest,
  setInstalled,
  uninstallService,
  updateService,
} from '../bundled';
import { mergeMysqlIniOptions } from '../bundled/mysql-configure';
import {
  getActivePhpVersion,
  getPhpInstallPath,
  isVersionInstalledOnDisk,
  listInstalledVersionDirs,
} from '../bundled/installed-versions';
import { getInstallDir, getInstalledRecord } from '../bundled/registry';
import { getCatalog, invalidateCatalog } from '../bundled/catalog';
import { clearCatalogCache } from '../bundled/catalog-cache';
import type {
  BundledServiceId,
  BundledServiceStatus,
  InstallProgressHandler,
} from '../bundled/types';
import { initConfig, loadConfig, saveConfig } from '../config/store';
import type {
  DevConfig,
  MysqlIniOptions,
  NginxOptions,
  PhpMyAdminOptions,
  Site,
  WebServer,
} from '../config/types';
import { HelperService } from './helper-service';
import { LogService } from './logs/log-service';
import { resolveServiceLogId } from './logs/resolve-service-log';
import {
  devMgrHttpConfPath,
  mergeNginxOptions,
  phpUploadLimitForNginxBodySize,
  writeDevMgrHttpConf,
} from '../bundled/nginx-configure';
import { ensureNginxMainConfig, nginxPathsFromInstallRoot } from '../bundled/nginx-paths';
import { ensureCaBundle } from './php-ca-bundle';
import { ensurePhpIni } from '../bundled/php-configure';
import {
  ensurePhpMyAdminConfig,
  mergePhpMyAdminOptions,
} from '../bundled/phpmyadmin-configure';
import { ensureRedisConfig } from '../bundled/redis-configure';
import { detectWebPortConflict } from './nginx-port-check';
import { reloadNginx } from './nginx-reload';
import { renderAll } from './render';
import {
  findSiteByName,
  getSiteDetail,
  resolveLaravelLogId,
  runLaravelArtisan,
} from './site-commands';
import { ManagedProcess, ServiceManager } from './services';
import { buildPhpCgiSpawn, resolvePhpCgiBinary } from './services/php-cgi';
import { phpPortForVersion, requiredIsolatedVersions } from './php-isolation';
import {
  disableBrokenPhpExtensions,
  enableRecommendedExtensions,
  listPhpExtensions,
  normalizeEnabledExtensions,
  setPhpExtensionEnabled,
  type PhpExtensionInfo,
} from './php-extensions';
import { installPeclExtension, listPeclInstallable } from './pecl-installer';
import { detectPhpBuild } from './php-build';
import {
  getPhpIniForVersion,
  openPhpIniInEditor,
  readPhpQuickSettings,
  writePhpQuickSettings,
  type PhpQuickSettings,
} from './php-ini';
import {
  applyMysqlIni,
  getMysqlIniForVersion,
  getMysqlInstallPath,
  openMysqlIniInEditor,
  readMysqlSettingsFromDisk,
} from './mysql-ini';
import {
  getPhpMyAdminInstallPath,
  openPhpMyAdminConfigInEditor,
  readPhpMyAdminSettingsFromDisk,
} from './phpmyadmin-config';
import {
  getNginxInstallPath,
  openNginxConfInEditor,
  readNginxSettingsFromDisk,
} from './nginx-ini';
import {
  phpMyAdminConfigPath,
  resolvePhpMyAdminRoot,
} from '../bundled/phpmyadmin-configure';
import { getServicePortLabel } from './service-ports';
import { createLaravelProject, cloneGitProject, resolveExistingProjectPath } from './site-actions';
import {
  addRegisteredSite,
  loadSitesFromRegistry,
  removeRegisteredSite,
} from './sites-registry';
import { updateRegisteredSite } from './site-config';
import {
  collectEnvPaths,
  listEnvPathCandidates,
  resolveSelectedPathIds,
} from './collect-env-paths';
import {
  broadcastEnvironmentChange,
  restartWindowsEnvironment,
  syncWindowsUserPath,
  type EnvRestartResult,
  type EnvSyncResult,
} from './windows-env';
import { isDevMgrCaTrusted } from './ssl-trust';
import { installRootCertCurrentUser } from '../helper/cert';
import { hostsFileHasAllEntries, getHostsPath } from '../helper/hosts';
import { openTerminalCommand } from './site-terminal';
import {
  getComposerStatus as readComposerStatus,
  installComposer as installComposerTool,
  type ComposerStatus,
} from './composer';
import { collectTlsSanNames, ensureDevCerts, ensureFullChainCert } from './tls';
import {
  ensureDataLayout,
  getConfigPath,
  getDataDir,
  getLogsDir,
  getProjectsDir,
} from '../shared/paths';

export type AppSettingsPatch = {
  general?: {
    path_in_env?: boolean;
    path_env_selected?: string[];
    start_minimized?: boolean;
    start_maximized?: boolean;
    autostart?: boolean;
    launch_on_login?: boolean;
  };
  services?: Partial<{
    nginx: { enabled?: boolean };
    apache: { enabled?: boolean };
    php: { enabled?: boolean };
    mysql: { enabled?: boolean };
    postgres: { enabled?: boolean };
    redis: { enabled?: boolean };
    nodejs: { enabled?: boolean };
    phpmyadmin: { enabled?: boolean };
    mailpit: { enabled?: boolean };
    mongodb: { enabled?: boolean };
    python: { enabled?: boolean };
  }>;
};

const SERVICE_START_ORDER = ['nginx', 'php-fpm', 'mysql', 'postgres', 'redis'] as const;

export type BootstrapPhase =
  | 'config'
  | 'listed'
  | { kind: 'starting'; service: string }
  | { kind: 'started'; service: string }
  | 'finishing'
  | 'ready';

function deferToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function configServiceKeyToRuntime(
  key: keyof NonNullable<AppSettingsPatch['services']>,
): string | null {
  if (key === 'php') return 'php-fpm';
  if (key === 'nodejs' || key === 'phpmyadmin' || key === 'python') return null;
  // nginx, apache, mysql, postgres, redis, mailpit, mongodb map 1:1 to runtimes.
  return key;
}

/** Order an arbitrary service list for sequential start (exported for tests). */
export function orderServicesForSequentialStart(services: string[]): string[] {
  const requested = new Set(services);
  return SERVICE_START_ORDER.filter((name) => requested.has(name));
}

const SSL_TRUST_CACHE_MS = 60_000;
const PORT_CONFLICT_CACHE_MS = 20_000;
const PHP_SUPERVISOR_MS = 15_000;

export class Orchestrator {
  private config: DevConfig;
  private sites: Site[] = [];
  private readonly helper = new HelperService();
  private services: ServiceManager;
  readonly logs = new LogService();
  private bundledCatalogCache: BundledServiceStatus[] | null = null;
  private sslTrustCache: { trusted: boolean; caCertPath: string; checkedAt: number } | null =
    null;
  private portConflictCache: { message: string | undefined; checkedAt: number } | null = null;
  private phpAutoRestart = false;
  private phpSupervisorTimer: ReturnType<typeof setInterval> | null = null;
  private phpFpmHealthFailures = 0;
  /** Dedicated php-cgi instances for per-site isolated (non-default) PHP versions. */
  private isolatedPhp = new Map<string, ManagedProcess>();

  constructor(config?: DevConfig) {
    this.config = config ?? loadConfig();
    this.services = new ServiceManager(this.config);
    this.refreshSites();
  }

  static createInitialized(): Orchestrator {
    ensureDataLayout();
    initConfig();
    const config = loadConfig();
    const synced = applyManifestToConfig(config, readManifest());
    if (JSON.stringify(synced) !== JSON.stringify(config)) {
      saveConfig(synced);
    }
    return new Orchestrator(synced);
  }

  reloadFromDisk(): void {
    this.config = applyManifestToConfig(loadConfig(), readManifest());
    saveConfig(this.config);
    this.services = new ServiceManager(this.config);
    this.refreshSites();
  }

  getConfig(): DevConfig {
    return this.config;
  }

  getAppPaths() {
    return {
      dataDir: getDataDir(),
      configPath: getConfigPath(),
      projectsDir: getProjectsDir(),
      logsDir: getLogsDir(),
      hostsPath: getHostsPath(),
    };
  }

  getEnvironmentInfo() {
    const candidates = listEnvPathCandidates(this.config);
    const selected = resolveSelectedPathIds(this.config, candidates);
    return {
      candidates,
      selected,
      paths: collectEnvPaths(this.config),
    };
  }

  async syncEnvironmentPath(): Promise<EnvSyncResult> {
    const paths = collectEnvPaths(this.config);
    const result = await syncWindowsUserPath(paths);
    if (result.paths.length > 0) {
      try {
        await broadcastEnvironmentChange();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[dev-mgr] PATH broadcast skipped:', msg);
      }
    }
    return result;
  }

  async restartEnvironment(openTerminal = true): Promise<EnvRestartResult> {
    return restartWindowsEnvironment(this.config, { openTerminal });
  }

  getComposerStatus(): ComposerStatus {
    return readComposerStatus();
  }

  async installComposer(): Promise<ComposerStatus> {
    const status = await installComposerTool();
    // Add Composer to PATH if the user's selection includes everything.
    try {
      await this.syncEnvironmentPath();
    } catch {
      // PATH sync is best-effort
    }
    return status;
  }

  async saveAppSettings(patch: AppSettingsPatch): Promise<DevConfig> {
    if (patch.general) {
      if (patch.general.path_in_env !== undefined) {
        this.config.general.path_in_env = patch.general.path_in_env;
      }
      if (patch.general.path_env_selected !== undefined) {
        this.config.general.path_env_selected = [...patch.general.path_env_selected];
      }
      if (patch.general.start_minimized !== undefined) {
        this.config.general.start_minimized = patch.general.start_minimized;
      }
      if (patch.general.start_maximized !== undefined) {
        this.config.general.start_maximized = patch.general.start_maximized;
      }
      if (patch.general.autostart !== undefined) {
        this.config.general.autostart = patch.general.autostart;
      }
      if (patch.general.launch_on_login !== undefined) {
        this.config.general.launch_on_login = patch.general.launch_on_login;
      }
    }
    const stopRuntime: string[] = [];
    if (patch.services) {
      for (const [key, val] of Object.entries(patch.services) as [
        keyof NonNullable<AppSettingsPatch['services']>,
        { enabled?: boolean },
      ][]) {
        if (val?.enabled === undefined) continue;
        const svc = this.config.services[key];
        if (svc) svc.enabled = val.enabled;
        if (val.enabled === false) {
          const runtime = configServiceKeyToRuntime(key);
          if (runtime) stopRuntime.push(runtime);
        }
      }
    }
    saveConfig(this.config);
    this.services = new ServiceManager(this.config);
    for (const name of stopRuntime) {
      try {
        await this.stopService(name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dev-mgr] stop ${name} after disable:`, msg);
      }
    }
    await this.apply();
    return this.config;
  }

  getSites(): Site[] {
    return [...this.sites];
  }

  getDataDir(): string {
    return getDataDir();
  }

  refreshSites(): void {
    this.sites = loadSitesFromRegistry();
    this.logs.refresh(this.sites, this.config.services.php.version);
  }

  park(_directory: string): DevConfig {
    throw new Error(
      'Park folder is no longer used. Add projects from Sites → New Laravel or Link existing.',
    );
  }

  private collectHostsHostnames(): string[] {
    const names = new Set<string>();
    for (const site of this.sites) {
      if (site.enabled === false) continue;
      if (site.hostname) names.add(site.hostname.trim().toLowerCase());
      for (const alias of site.aliases ?? []) {
        const h = alias.trim().toLowerCase();
        if (h) names.add(h);
      }
    }
    const pma = this.config.services.phpmyadmin;
    if (pma.enabled && pma.hostname) {
      names.add(pma.hostname.trim().toLowerCase());
    }
    return [...names];
  }

  /** Regenerate configs/certs (no helper, no PATH broadcast). */
  private async applyLocalConfigs(): Promise<void> {
    ensureDataLayout();
    const sanNames = collectTlsSanNames(this.config, this.sites);
    ensureDevCerts(sanNames);
    ensureFullChainCert();
    renderAll(this.config, this.sites);

    const nginxSvc = this.config.services.nginx;
    if (nginxSvc.config) {
      writeDevMgrHttpConf(mergeNginxOptions(nginxSvc.options));
      ensureNginxMainConfig(nginxSvc.config, nginxSvc.options);
    }

    const redis = this.config.services.redis;
    if (redis.binary && fs.existsSync(redis.binary)) {
      const installRoot = path.dirname(path.resolve(redis.binary));
      const confPath = ensureRedisConfig(installRoot, redis.port);
      if (redis.config !== confPath) {
        this.config.services.redis.config = confPath;
        saveConfig(this.config);
        this.services = new ServiceManager(this.config);
      }
    }

    const pma = this.config.services.phpmyadmin;
    if (pma.enabled && pma.path) {
      const mysqlPort = this.config.services.mysql.port;
      const uploadCap = phpUploadLimitForNginxBodySize(
        mergeNginxOptions(this.config.services.nginx.options).client_max_body_size,
      );
      ensurePhpMyAdminConfig(
        pma.path,
        mergePhpMyAdminOptions(
          {
            ...pma.options,
            mysql_port: pma.options?.mysql_port ?? mysqlPort,
            max_size: uploadCap,
          },
          mysqlPort,
        ),
      );
      if (pma.options?.max_size !== uploadCap) {
        pma.options = { ...pma.options, max_size: uploadCap };
        saveConfig(this.config);
      }
    }

    if (this.config.general.web_server === 'apache') {
      await this.restartApacheIfRunning();
    } else {
      await this.restartNginxIfRunning();
    }
  }

  /** Reload alone can leave old workers (e.g. 1m body limit); full restart applies vhost changes. */
  private async restartNginxIfRunning(): Promise<void> {
    if (this.services.nginx.status.state !== 'running') return;
    try {
      await this.restartNginx();
    } catch {
      // config is on disk for the next manual start
    }
  }

  private async restartApacheIfRunning(): Promise<void> {
    if (this.services.apache.status.state !== 'running') return;
    try {
      await this.stopService('apache');
      await this.startService('apache');
    } catch {
      // config is on disk for the next manual start
    }
  }

  /** Switch the active web server, stopping the old one and starting the new. */
  async setWebServer(server: WebServer): Promise<DevConfig> {
    if (server !== 'nginx' && server !== 'apache') {
      throw new Error(`Unknown web server: ${server}`);
    }
    const previous = this.config.general.web_server;
    if (previous === server) return this.config;

    const oldRuntime = previous === 'apache' ? 'apache' : 'nginx';
    const newRuntime = server === 'apache' ? 'apache' : 'nginx';
    const wasRunning = this.getService(oldRuntime).status.state === 'running';

    if (wasRunning) {
      try {
        await this.stopService(oldRuntime);
      } catch {
        // ignore
      }
    }

    this.config.general.web_server = server;
    saveConfig(this.config);
    await this.apply();

    if (wasRunning && this.getService(newRuntime).isConfigured) {
      try {
        await this.startService(newRuntime);
      } catch {
        // surfaced on next refresh
      }
    }
    return this.config;
  }

  // ---- Per-site PHP isolation: a dedicated php-cgi per non-default version ----

  private buildIsolatedPhpProcess(
    version: string,
    active: string,
    installed: string[],
  ): ManagedProcess | null {
    const phpRoot = getPhpInstallPath(version);
    if (!phpRoot) return null;
    const cgi = resolvePhpCgiBinary(
      path.join(phpRoot, 'php-cgi.exe'),
      path.join(phpRoot, 'php.exe'),
    );
    const port = phpPortForVersion(version, active, installed);
    let spawn;
    try {
      spawn = buildPhpCgiSpawn(cgi, port);
    } catch {
      return null;
    }
    return new ManagedProcess(
      `php-fpm-${version}`,
      cgi,
      spawn.args,
      `php-cgi-${version}.pid`,
      spawn.cwd,
      {
        listenPort: port,
        spawnEnv: spawn.env,
        supervise: true,
        stderrLog: path.join(getLogsDir(), `php-cgi-${version}.stderr.log`),
      },
    );
  }

  /** Start php-cgi instances required by isolated sites; stop those no longer needed. */
  private async reconcileIsolatedPhp(): Promise<void> {
    const active = this.getDefaultPhpVersion();
    const installed = listInstalledVersionDirs('php');
    const required = new Set(requiredIsolatedVersions(this.sites, active, installed));

    for (const [ver, proc] of [...this.isolatedPhp]) {
      if (!required.has(ver)) {
        try {
          await proc.stop();
        } catch {
          // ignore
        }
        this.isolatedPhp.delete(ver);
      }
    }

    for (const ver of required) {
      let proc = this.isolatedPhp.get(ver);
      if (!proc) {
        const built = this.buildIsolatedPhpProcess(ver, active, installed);
        if (!built) continue;
        proc = built;
        this.isolatedPhp.set(ver, proc);
      }
      if (proc.status.state !== 'running') {
        try {
          await proc.start();
        } catch {
          // surfaced on next refresh
        }
      }
    }
  }

  private async stopIsolatedPhp(): Promise<void> {
    for (const [, proc] of this.isolatedPhp) {
      try {
        await proc.stop();
      } catch {
        // ignore
      }
    }
    this.isolatedPhp.clear();
  }

  private async applyPhpMaintenance(): Promise<void> {
    const caBundlePath = await ensureCaBundle();
    for (const version of listInstalledVersionDirs('php')) {
      const phpRoot = getPhpInstallPath(version);
      if (!phpRoot) continue;
      ensurePhpIni(phpRoot, { caBundlePath });
    }

    const phpRoot = getPhpInstallPath(this.getDefaultPhpVersion());
    if (!phpRoot) return;
    disableBrokenPhpExtensions(phpRoot);
    normalizeEnabledExtensions(phpRoot);
  }

  getHostsSyncStatus(): {
    hostnames: string[];
    complete: boolean;
    missing: string[];
  } {
    const hostnames = this.collectHostsHostnames();
    const check = hostsFileHasAllEntries(hostnames);
    return {
      hostnames,
      complete: check.complete,
      missing: check.missing,
    };
  }

  /**
   * Update the hosts file only when entries are missing (no UAC if already complete).
   */
  async syncHostsIfNeeded(): Promise<{
    updated: boolean;
    skipped: boolean;
    missing: string[];
  }> {
    const hostnames = this.collectHostsHostnames();
    if (hostnames.length === 0) {
      return { updated: false, skipped: true, missing: [] };
    }

    const check = hostsFileHasAllEntries(hostnames);
    if (check.complete) {
      return { updated: false, skipped: true, missing: [] };
    }

    await this.helper.hostsSync(hostnames);
    return { updated: true, skipped: false, missing: check.missing };
  }

  /**
   * Hosts file + SSL trust for local sites. UAC only when hosts or machine cert need changes.
   * Called when adding/linking a site or Sync hosts.
   */
  async provisionSiteHostsAndSsl(): Promise<void> {
    await this.syncHostsIfNeeded();

    const certs = ensureDevCerts(collectTlsSanNames(this.config, this.sites));
    if (isDevMgrCaTrusted(certs.caCertPath)) return;

    try {
      installRootCertCurrentUser(certs.caCertPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[dev-mgr] CA trust (current user) failed:', msg);
    }

    if (isDevMgrCaTrusted(certs.caCertPath)) return;

    try {
      await this.helper.certInstall(certs.caCertPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not trust the local SSL certificate: ${msg}`);
    }

    try {
      installRootCertCurrentUser(certs.caCertPath);
    } catch {
      // user store may already contain the CA after machine install
    }
  }

  async apply(): Promise<void> {
    await this.applyLocalConfigs();
    await this.applyPhpMaintenance();
    await this.syncEnvironmentPath();
    // Keep isolated php-cgi instances in sync when PHP is running.
    if (this.services.phpFpm.status.state === 'running') {
      await this.reconcileIsolatedPhp();
    }
  }

  /**
   * Full reload: regenerate every config + TLS cert (so sites are served over
   * HTTPS), then restart every running runtime (nginx/apache/php/db/…) so the
   * new configuration and certificates take effect everywhere.
   */
  async reloadAll(): Promise<unknown> {
    const running = this.runtimeServiceStatuses()
      .filter((s) => s.state === 'running')
      .map((s) => s.name);

    await this.apply();

    if (running.length > 0) {
      await this.stop(running);
      await this.start(running);
    }
    return this.status();
  }

  /** Installed (binary on disk) and enabled services, in safe start order. */
  getInstalledStartableNames(): string[] {
    const webServer = this.config.general.web_server === 'apache' ? 'apache' : 'nginx';
    return SERVICE_START_ORDER.flatMap((name) => {
      // Only the active web server (nginx OR apache) is startable.
      const target = name === 'nginx' ? webServer : name;
      if (!this.isServiceEnabled(target)) return [];
      return this.getService(target).isConfigured ? [target] : [];
    });
  }

  async start(services?: string[]): Promise<void> {
    const targets = this.resolveServiceNames(services);
    if (targets.length === 0) return;

    const results = await Promise.allSettled(
      targets.map((name) => this.getService(name).start()),
    );
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    if (errors.length > 0) {
      throw new Error(errors.join('\n\n'));
    }
    if (targets.includes('php-fpm')) {
      this.markPhpAutoRestart(true);
      await this.reconcileIsolatedPhp();
    }
  }

  /** Start services one at a time in safe order (launch path only). */
  async startSequential(services: string[]): Promise<void> {
    const ordered = orderServicesForSequentialStart(services);
    const errors: string[] = [];

    for (const name of ordered) {
      try {
        await this.getService(name).start();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('\n\n'));
    }
    if (ordered.includes('php-fpm')) {
      this.markPhpAutoRestart(true);
      await this.reconcileIsolatedPhp();
    }
  }

  /** Fast autostart: configs, list services, then sequential starts; PHP tuning in background. */
  async bootstrapOnLaunch(onPhase?: (phase: BootstrapPhase) => void): Promise<void> {
    this.reloadFromDisk();
    onPhase?.('config');
    await this.applyLocalConfigs();
    await this.stopDisabledRunningServices();

    onPhase?.('listed');
    await deferToEventLoop();

    // Respect the autostart setting — when off, configs are applied but no
    // services are started on launch.
    const names =
      this.config.general.autostart === false ? [] : this.getInstalledStartableNames();
    for (const name of names) {
      onPhase?.({ kind: 'starting', service: name });
      try {
        await this.startSequential([name]);
        onPhase?.({ kind: 'started', service: name });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dev-mgr] autostart ${name}:`, msg);
        onPhase?.({ kind: 'started', service: name });
      }
    }

    onPhase?.('finishing');
    void this.applyPhpMaintenance()
      .then(() => onPhase?.('ready'))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[dev-mgr] background bootstrap:', msg);
        onPhase?.('ready');
      });
  }

  async stop(services?: string[]): Promise<void> {
    const targets = this.resolveServiceNames(services);
    if (targets.includes('php-fpm')) {
      this.markPhpAutoRestart(false);
      await this.stopIsolatedPhp();
    }
    for (const name of targets) {
      await this.getService(name).stop();
    }
  }

  disconnectHelper(): void {
    this.helper.disconnect();
  }

  /** Stop every configured service on app exit (nginx master + workers included). */
  async stopAllOnQuit(): Promise<void> {
    this.markPhpAutoRestart(false);
    await this.stopIsolatedPhp();
    const order = [...SERVICE_START_ORDER].reverse();
    for (const name of order) {
      try {
        const svc = this.getService(name);
        if (!svc.isConfigured) continue;
        await svc.stop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dev-mgr] stop ${name} on quit:`, msg);
      }
    }
  }

  async startService(serviceName: string): Promise<void> {
    if (serviceName === 'php-fpm' || serviceName === 'php') {
      const phpRoot = path.dirname(
        path.resolve(this.config.services.php.fpm_binary || this.config.services.php.php_binary),
      );
      if (phpRoot && fs.existsSync(path.join(phpRoot, 'php-cgi.exe'))) {
        const caBundlePath = await ensureCaBundle();
        ensurePhpIni(phpRoot, { caBundlePath });
        this.services = new ServiceManager(this.config);
      }
    }
    await this.getService(serviceName).start();
    if (serviceName === 'php-fpm' || serviceName === 'php') {
      this.markPhpAutoRestart(true);
    }
  }

  async stopService(serviceName: string): Promise<void> {
    if (serviceName === 'php-fpm' || serviceName === 'php') {
      this.markPhpAutoRestart(false);
    }
    await this.getService(serviceName).stop();
  }

  listPhpVersions(): string[] {
    return listInstalledVersionDirs('php');
  }

  getDefaultPhpVersion(): string {
    return getActivePhpVersion() ?? this.config.services.php.version;
  }

  async setActiveBundledVersion(serviceId: BundledServiceId, version: string): Promise<void> {
    if (!isVersionInstalledOnDisk(serviceId, version)) {
      throw new Error(`${serviceId} ${version} is not installed`);
    }
    // Stop the currently-running runtime BEFORE repointing to the new version,
    // otherwise the old binary keeps holding its port (e.g. php-cgi on 9000) and
    // the freshly-built ServiceManager adopts/conflicts with it → 502s on switch.
    const targets = this.stopTargetsForBundled(serviceId);
    const runningNames = new Set(
      this.runtimeServiceStatuses()
        .filter((s) => s.state === 'running')
        .map((s) => s.name),
    );
    const wasRunning = targets.filter((t) => runningNames.has(t));
    if (wasRunning.length > 0) {
      await this.stop(targets);
    }

    setInstalled(serviceId, version, getInstallDir(serviceId, version));
    await this.reloadAfterBundledChange();

    // Bring the runtime back up on the new version if it had been running.
    for (const target of wasRunning) {
      try {
        await this.startService(target);
      } catch {
        // start failures surface via status/rowErrors on the next refresh
      }
    }
  }

  async setDefaultPhpVersion(version: string): Promise<void> {
    await this.setActiveBundledVersion('php', version);
  }

  listInstalledVersions(serviceId: BundledServiceId): string[] {
    return listInstalledVersionDirs(serviceId);
  }

  getServiceVersionInfo(serviceId: BundledServiceId, version: string) {
    const installed = isVersionInstalledOnDisk(serviceId, version);
    const activeVersion = getInstalledRecord(serviceId)?.version ?? null;
    return {
      version,
      installed,
      active: activeVersion === version,
      path: installed ? getInstallDir(serviceId, version) : '',
    };
  }

  private resolvePhpVersion(version?: string): string {
    const v = version?.trim();
    if (v) {
      if (!getPhpInstallPath(v)) {
        throw new Error(`PHP ${v} is not installed`);
      }
      return v;
    }
    return this.getDefaultPhpVersion();
  }

  getPhpSettings(version?: string): { version: string; iniPath: string; settings: PhpQuickSettings } | null {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) return null;
    return {
      version: resolved,
      iniPath: info.iniPath,
      settings: readPhpQuickSettings(info.iniPath),
    };
  }

  async savePhpSettings(patch: Partial<PhpQuickSettings>, version?: string): Promise<void> {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) throw new Error(`php.ini not found for PHP ${resolved}`);
    writePhpQuickSettings(info.iniPath, patch);
    await this.apply();
  }

  openPhpIni(version?: string): void {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) throw new Error(`php.ini not found for PHP ${resolved}`);
    openPhpIniInEditor(info.iniPath);
  }

  getPhpExtensions(version?: string): { version: string; iniPath: string | null; extensions: PhpExtensionInfo[] } | null {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) return null;
    return {
      version: resolved,
      iniPath: info.iniPath,
      extensions: listPhpExtensions(info.phpRoot),
    };
  }

  async setPhpExtension(name: string, enabled: boolean, version?: string): Promise<void> {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) throw new Error(`php.ini not found for PHP ${resolved}`);
    setPhpExtensionEnabled(info.phpRoot, name, enabled);
    await this.apply();
  }

  async enableRecommendedPhpExtensions(version?: string): Promise<void> {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) throw new Error(`php.ini not found for PHP ${resolved}`);
    enableRecommendedExtensions(info.phpRoot);
    await this.apply();
  }

  getPhpPeclInstallable(version?: string) {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) return null;
    return {
      version: resolved,
      build: detectPhpBuild(info.phpRoot),
      packages: listPeclInstallable(info.phpRoot),
    };
  }

  async installPhpPeclExtension(peclName: string, version?: string): Promise<string> {
    const resolved = this.resolvePhpVersion(version);
    const info = getPhpIniForVersion(resolved);
    if (!info) throw new Error(`php.ini not found for PHP ${resolved}`);
    const name = await installPeclExtension(info.phpRoot, peclName);
    await this.apply();
    await this.restartPhp();
    return name;
  }

  async restartPhp(): Promise<void> {
    await this.stopService('php-fpm');
    await this.startService('php-fpm');
  }

  private resolveMysqlVersion(version?: string): string {
    if (version) {
      if (!getMysqlInstallPath(version)) {
        throw new Error(`MariaDB ${version} is not installed`);
      }
      return version;
    }
    const active =
      this.config.services.mysql.installed_version ??
      getInstalledRecord('mysql')?.version;
    if (active && getMysqlInstallPath(active)) return active;
    const onDisk = listInstalledVersionDirs('mysql');
    if (onDisk[0]) return onDisk[0];
    throw new Error('MariaDB is not installed');
  }

  getMysqlSettings(version?: string): {
    version: string;
    iniPath: string;
    port: number;
    settings: MysqlIniOptions;
  } | null {
    const resolved = this.resolveMysqlVersion(version);
    const mysql = this.config.services.mysql;
    const dataDir =
      mysql.data_dir ||
      (mysql.binary ? path.join(path.dirname(path.dirname(mysql.binary)), 'data') : '');
    const info = getMysqlIniForVersion(resolved, dataDir);
    if (!info) return null;
    const settings = readMysqlSettingsFromDisk(info.iniPath, mysql.options);
    return {
      version: resolved,
      iniPath: info.iniPath,
      port: mysql.port,
      settings,
    };
  }

  async saveMysqlSettings(
    patch: Partial<MysqlIniOptions> & { port?: number },
    version?: string,
  ): Promise<void> {
    const resolved = this.resolveMysqlVersion(version);
    const mysql = this.config.services.mysql;
    if (patch.port !== undefined) {
      mysql.port = patch.port;
    }
    const { port: _p, ...optionPatch } = patch;
    mysql.options = mergeMysqlIniOptions({ ...mysql.options, ...optionPatch });
    saveConfig(this.config);

    const dataDir =
      mysql.data_dir ||
      (mysql.binary ? path.join(path.dirname(path.dirname(mysql.binary)), 'data') : '');
    const info = getMysqlIniForVersion(resolved, dataDir);
    if (!info) throw new Error(`my.ini not found for MariaDB ${resolved}`);
    applyMysqlIni(info.installRoot, info.dataDir, mysql.port, mysql.options);
    await this.apply();
  }

  openMysqlIni(version?: string): void {
    const resolved = this.resolveMysqlVersion(version);
    const mysql = this.config.services.mysql;
    const dataDir =
      mysql.data_dir ||
      (mysql.binary ? path.join(path.dirname(path.dirname(mysql.binary)), 'data') : '');
    const info = getMysqlIniForVersion(resolved, dataDir);
    if (!info) throw new Error(`my.ini not found for MariaDB ${resolved}`);
    openMysqlIniInEditor(info.iniPath);
  }

  async restartMysql(): Promise<void> {
    await this.stopService('mysql');
    await this.startService('mysql');
  }

  private resolvePhpMyAdminVersion(version?: string): string {
    if (version) {
      if (!getPhpMyAdminInstallPath(version)) {
        throw new Error(`phpMyAdmin ${version} is not installed`);
      }
      return version;
    }
    const active =
      this.config.services.phpmyadmin.installed_version ??
      getInstalledRecord('phpmyadmin')?.version;
    if (active && getPhpMyAdminInstallPath(active)) return active;
    const onDisk = listInstalledVersionDirs('phpmyadmin');
    if (onDisk[0]) return onDisk[0];
    throw new Error('phpMyAdmin is not installed');
  }

  private phpMyAdminInstallPathForVersion(version: string): string {
    const pma = this.config.services.phpmyadmin;
    const active =
      pma.installed_version ?? getInstalledRecord('phpmyadmin')?.version ?? '';
    if (version === active && pma.path) return pma.path;
    const dir = getPhpMyAdminInstallPath(version);
    if (!dir) throw new Error(`phpMyAdmin ${version} is not installed`);
    const root = resolvePhpMyAdminRoot(dir);
    return root ?? dir;
  }

  getPhpMyAdminSettings(version?: string): {
    version: string;
    configPath: string;
    hostname: string;
    url: string;
    settings: PhpMyAdminOptions;
  } | null {
    const resolved = this.resolvePhpMyAdminVersion(version);
    const installPath = this.phpMyAdminInstallPathForVersion(resolved);
    const configPath = phpMyAdminConfigPath(installPath);
    if (!configPath) return null;

    const pma = this.config.services.phpmyadmin;
    const mysqlPort = this.config.services.mysql.port;
    const settings = readPhpMyAdminSettingsFromDisk(installPath, pma.options, mysqlPort);
    const hostname = pma.hostname || 'phpmyadmin.test';
    return {
      version: resolved,
      configPath,
      hostname,
      url: `https://${hostname}`,
      settings,
    };
  }

  async savePhpMyAdminSettings(
    patch: Partial<PhpMyAdminOptions> & { hostname?: string },
    version?: string,
  ): Promise<void> {
    const resolved = this.resolvePhpMyAdminVersion(version);
    const pma = this.config.services.phpmyadmin;
    if (patch.hostname !== undefined) {
      pma.hostname = patch.hostname.trim() || 'phpmyadmin.test';
    }
    const { hostname: _h, ...optionPatch } = patch;
    const mysqlPort = this.config.services.mysql.port;
    pma.options = mergePhpMyAdminOptions({ ...pma.options, ...optionPatch }, mysqlPort);
    saveConfig(this.config);

    const installPath = this.phpMyAdminInstallPathForVersion(resolved);
    if (!phpMyAdminConfigPath(installPath)) {
      throw new Error(`config.inc.php not found for phpMyAdmin ${resolved}`);
    }
    ensurePhpMyAdminConfig(installPath, pma.options);
    await this.apply();
  }

  openPhpMyAdminConfig(version?: string): void {
    const resolved = this.resolvePhpMyAdminVersion(version);
    const installPath = this.phpMyAdminInstallPathForVersion(resolved);
    const configPath = phpMyAdminConfigPath(installPath);
    if (!configPath) throw new Error(`config.inc.php not found for phpMyAdmin ${resolved}`);
    openPhpMyAdminConfigInEditor(configPath);
  }

  private resolveNginxVersion(version?: string): string {
    if (version) {
      if (!getNginxInstallPath(version)) {
        throw new Error(`nginx ${version} is not installed`);
      }
      return version;
    }
    const active =
      this.config.services.nginx.installed_version ?? getInstalledRecord('nginx')?.version;
    if (active && getNginxInstallPath(active)) return active;
    const onDisk = listInstalledVersionDirs('nginx');
    if (onDisk[0]) return onDisk[0];
    throw new Error('nginx is not installed');
  }

  private nginxConfigPathForVersion(version: string): string {
    const nginx = this.config.services.nginx;
    const active =
      nginx.installed_version ?? getInstalledRecord('nginx')?.version ?? '';
    if (version === active && nginx.config) return nginx.config;
    const dir = getNginxInstallPath(version);
    if (!dir) throw new Error(`nginx ${version} is not installed`);
    const paths = nginxPathsFromInstallRoot(dir);
    if (!paths?.config) throw new Error(`nginx.conf not found for nginx ${version}`);
    return paths.config;
  }

  getNginxSettings(version?: string): {
    version: string;
    configPath: string;
    httpConfPath: string;
    port: number;
    ssl_port: number;
    settings: NginxOptions;
  } | null {
    const resolved = this.resolveNginxVersion(version);
    const configPath = this.nginxConfigPathForVersion(resolved);
    if (!configPath) return null;

    const nginx = this.config.services.nginx;
    const settings = readNginxSettingsFromDisk(nginx.options);
    return {
      version: resolved,
      configPath,
      httpConfPath: devMgrHttpConfPath(),
      port: nginx.port,
      ssl_port: nginx.ssl_port,
      settings,
    };
  }

  async saveNginxSettings(
    patch: Partial<NginxOptions> & { port?: number; ssl_port?: number },
    version?: string,
  ): Promise<void> {
    this.resolveNginxVersion(version);
    const nginx = this.config.services.nginx;
    if (patch.port !== undefined) nginx.port = patch.port;
    if (patch.ssl_port !== undefined) nginx.ssl_port = patch.ssl_port;
    const { port: _p, ssl_port: _s, ...optionPatch } = patch;
    nginx.options = mergeNginxOptions({ ...nginx.options, ...optionPatch });
    saveConfig(this.config);

    writeDevMgrHttpConf(nginx.options);
    const configPath = nginx.config || this.nginxConfigPathForVersion(this.resolveNginxVersion(version));
    if (configPath) {
      ensureNginxMainConfig(configPath, nginx.options);
    }
    this.syncPhpUploadLimitsToNginx();
    this.syncPhpMyAdminUploadLimitToNginx();
    await this.apply();
  }

  /** phpMyAdmin import tab uses $cfg['MaxSize'] — keep it aligned with nginx. */
  private syncPhpMyAdminUploadLimitToNginx(): void {
    const pma = this.config.services.phpmyadmin;
    if (!pma.enabled || !pma.path) return;
    const limit = phpUploadLimitForNginxBodySize(
      mergeNginxOptions(this.config.services.nginx.options).client_max_body_size,
    );
    pma.options = mergePhpMyAdminOptions({ ...pma.options, max_size: limit });
    saveConfig(this.config);
    ensurePhpMyAdminConfig(pma.path, pma.options);
  }

  /** Keep PHP upload/post limits in line with nginx client_max_body_size. */
  private syncPhpUploadLimitsToNginx(): void {
    const limit = phpUploadLimitForNginxBodySize(
      mergeNginxOptions(this.config.services.nginx.options).client_max_body_size,
    );
    const resolved = this.getDefaultPhpVersion();
    const info = getPhpIniForVersion(resolved);
    if (!info) return;
    writePhpQuickSettings(info.iniPath, {
      upload_max_filesize: limit,
      post_max_size: limit,
    });
  }

  openNginxConf(version?: string): void {
    const resolved = this.resolveNginxVersion(version);
    const configPath = this.nginxConfigPathForVersion(resolved);
    openNginxConfInEditor(configPath);
  }

  async restartNginx(): Promise<void> {
    await this.stopService('nginx');
    await this.startService('nginx');
  }

  private markPhpAutoRestart(enabled: boolean): void {
    this.phpAutoRestart = enabled;
    if (enabled) {
      this.startPhpSupervisor();
    } else {
      this.stopPhpSupervisor();
    }
  }

  private startPhpSupervisor(): void {
    if (this.phpSupervisorTimer) return;
    this.phpSupervisorTimer = setInterval(() => {
      void this.maintainPhpFpm();
    }, PHP_SUPERVISOR_MS);
  }

  private stopPhpSupervisor(): void {
    if (!this.phpSupervisorTimer) return;
    clearInterval(this.phpSupervisorTimer);
    this.phpSupervisorTimer = null;
  }

  /** Catch php-cgi exits that outlive a recreated ServiceManager instance. */
  private async maintainPhpFpm(): Promise<void> {
    if (!this.phpAutoRestart || !this.isServiceEnabled('php-fpm')) return;
    const svc = this.services.phpFpm;
    if (!svc.isConfigured) return;
    if (svc.status.state === 'running') {
      this.phpFpmHealthFailures = 0;
      return;
    }
    if (!this.phpAutoRestart) return;
    try {
      await svc.start();
      if (!this.phpAutoRestart) return;
      this.phpFpmHealthFailures = 0;
      console.warn('[dev-mgr] restarted php-fpm (process was stopped)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Opcode handlers are unusable due to ASLR/i.test(msg)) {
        this.phpFpmHealthFailures += 1;
        if (this.phpFpmHealthFailures >= 3) {
          this.markPhpAutoRestart(false);
          console.warn(
            '[dev-mgr] php-fpm: OPcache/ASLR startup failed. Click Re-apply in dev-mgr to update php.ini, then Start PHP.',
          );
          return;
        }
      }
      console.warn('[dev-mgr] php-fpm health restart failed:', msg);
    }
  }

  async createLaravelSite(
    name: string,
    onProgress?: (message: string) => void,
  ): Promise<Site[]> {
    const root = await createLaravelProject(getProjectsDir(), name, onProgress);
    onProgress?.('Registering site and applying configuration…');
    addRegisteredSite(name, root);
    this.refreshSites();
    await this.apply();
    await this.provisionSiteHostsAndSsl();
    onProgress?.('Done');
    return this.getSites();
  }

  async linkExistingSite(sourcePath: string, name?: string): Promise<Site[]> {
    const { name: siteName, root } = resolveExistingProjectPath(sourcePath, name);
    addRegisteredSite(siteName, root);
    this.refreshSites();
    await this.apply();
    await this.provisionSiteHostsAndSsl();
    return this.getSites();
  }

  async removeSite(name: string): Promise<Site[]> {
    removeRegisteredSite(name);
    this.refreshSites();
    await this.apply();
    return this.getSites();
  }

  async setSiteEnabled(name: string, enabled: boolean): Promise<Site[]> {
    updateRegisteredSite(name, { enabled });
    this.refreshSites();
    await this.apply();
    if (enabled) await this.provisionSiteHostsAndSsl();
    return this.getSites();
  }

  async setSiteFavorite(name: string, favorite: boolean): Promise<Site[]> {
    updateRegisteredSite(name, { favorite });
    this.refreshSites();
    return this.getSites();
  }

  async setSiteDomain(
    name: string,
    domain: string | null,
    aliases: string[],
  ): Promise<Site[]> {
    updateRegisteredSite(name, { domain, aliases });
    this.refreshSites();
    await this.apply();
    await this.provisionSiteHostsAndSsl();
    return this.getSites();
  }

  async setSiteDocRoot(name: string, docRoot: string | null): Promise<Site[]> {
    updateRegisteredSite(name, { doc_root: docRoot });
    this.refreshSites();
    await this.apply();
    return this.getSites();
  }

  /** Isolate a site to a specific installed PHP version (null = default). */
  async setSitePhpVersion(name: string, version: string | null): Promise<Site[]> {
    if (version && !getPhpInstallPath(version)) {
      throw new Error(`PHP ${version} is not installed`);
    }
    updateRegisteredSite(name, { php_version: version });
    this.refreshSites();
    await this.apply();
    return this.getSites();
  }

  async cloneGitSite(url: string, name?: string): Promise<Site[]> {
    const { name: siteName, root } = await cloneGitProject(getProjectsDir(), url, name);
    addRegisteredSite(siteName, root);
    this.refreshSites();
    await this.apply();
    await this.provisionSiteHostsAndSsl();
    return this.getSites();
  }

  getSiteDetailByName(name: string) {
    const site = findSiteByName(this.sites, name);
    if (!site) throw new Error(`Site not found: ${name}`);
    return getSiteDetail(site);
  }

  async runSiteArtisan(name: string, args: string[]): Promise<string> {
    const site = findSiteByName(this.sites, name);
    if (!site) throw new Error(`Site not found: ${name}`);
    return runLaravelArtisan(site, args);
  }

  /** Open an interactive `php artisan tinker` terminal in the site, active PHP on PATH. */
  async openSiteTinker(name: string): Promise<void> {
    const site = findSiteByName(this.sites, name);
    if (!site) throw new Error(`Site not found: ${name}`);
    const phpRoot = getPhpInstallPath(this.getDefaultPhpVersion());
    await openTerminalCommand({
      key: `tinker-${site.name}`,
      cwd: site.root,
      pathDirs: phpRoot ? [phpRoot] : [],
      command: 'php artisan tinker',
      title: `Tinker — ${site.name}`,
    });
  }

  /**
   * Share a site publicly via ngrok (host-header rewrite to the .test vhost).
   * Opens a terminal running ngrok — requires ngrok installed + an auth token
   * (`ngrok config add-authtoken ...`).
   */
  async openSiteShare(name: string): Promise<void> {
    const site = findSiteByName(this.sites, name);
    if (!site) throw new Error(`Site not found: ${name}`);
    await openTerminalCommand({
      key: `share-${site.name}`,
      cwd: site.root,
      pathDirs: [],
      command: `ngrok http --host-header=rewrite ${site.hostname}`,
      title: `Share — ${site.hostname}`,
    });
  }

  /** Open a plain terminal in the site folder with the active PHP on PATH. */
  async openSiteTerminal(name: string): Promise<void> {
    const site = findSiteByName(this.sites, name);
    if (!site) throw new Error(`Site not found: ${name}`);
    const phpRoot = getPhpInstallPath(this.getDefaultPhpVersion());
    await openTerminalCommand({
      key: `term-${site.name}`,
      cwd: site.root,
      pathDirs: phpRoot ? [phpRoot] : [],
      command: `echo Stacklet terminal — ${site.name}`,
      title: `Terminal — ${site.name}`,
    });
  }

  resolveLogIdForSite(name: string): string | null {
    const site = findSiteByName(this.sites, name);
    if (!site || site.framework !== 'laravel') return null;
    return resolveLaravelLogId(site);
  }

  resolveLogIdForService(bundledId: string): string | null {
    return resolveServiceLogId(
      bundledId,
      this.logs.listSources(),
      this.config.services.php.version,
    );
  }

  async refreshCatalog(): Promise<void> {
    clearCatalogCache();
    invalidateCatalog();
    await getCatalog(true);
  }

  async installBundled(
    serviceId: BundledServiceId,
    version: string,
    onProgress?: InstallProgressHandler,
  ): Promise<void> {
    const record = getInstalledRecord(serviceId);
    const installDir = getInstallDir(serviceId, version);
    const willRemoveDir = fs.existsSync(installDir);
    const activeDir = record?.path ? path.resolve(record.path) : null;
    if (willRemoveDir && activeDir === path.resolve(installDir)) {
      await this.stop(this.stopTargetsForBundled(serviceId));
    }
    await installService(serviceId, version, onProgress);
    await this.reloadAfterBundledChange();
  }

  async updateBundled(
    serviceId: BundledServiceId,
    version: string,
    onProgress?: InstallProgressHandler,
  ): Promise<void> {
    await this.stop(this.stopTargetsForBundled(serviceId));
    await updateService(serviceId, version, onProgress);
    await this.reloadAfterBundledChange();
  }

  async uninstallBundled(
    serviceId: BundledServiceId,
    onProgress?: InstallProgressHandler,
  ): Promise<void> {
    await this.stop(this.stopTargetsForBundled(serviceId));
    await uninstallService(serviceId, onProgress);
    await this.reloadAfterBundledChange();
  }

  private stopTargetsForBundled(serviceId: BundledServiceId): string[] {
    return serviceId === 'php' ? ['php-fpm'] : [serviceId];
  }

  private async reloadAfterBundledChange(): Promise<void> {
    this.config = applyManifestToConfig(loadConfig(), readManifest());
    saveConfig(this.config);
    this.services = new ServiceManager(this.config);
    this.refreshSites();
    this.clearStatusCaches();
    await this.apply();
  }

  private clearStatusCaches(): void {
    this.bundledCatalogCache = null;
    this.sslTrustCache = null;
    this.portConflictCache = null;
  }

  private runtimeServiceStatuses() {
    return this.services.startable().map((s) => ({
      ...s.status,
      port: getServicePortLabel(s.name, this.config),
    }));
  }

  async getBundledServices(): Promise<BundledServiceStatus[]> {
    const runtimeStatuses = this.services.startable().map((s) => s.status);
    if (!this.bundledCatalogCache) {
      this.bundledCatalogCache = await buildBundledStatus(runtimeStatuses);
      return this.bundledCatalogCache;
    }
    return applyRuntimeToBundledStatus(this.bundledCatalogCache, runtimeStatuses);
  }

  getSslTrustStatus(): { trusted: boolean; caCertPath: string } {
    const certs = ensureDevCerts(collectTlsSanNames(this.config, this.sites));
    const now = Date.now();
    if (
      this.sslTrustCache &&
      this.sslTrustCache.caCertPath === certs.caCertPath &&
      now - this.sslTrustCache.checkedAt < SSL_TRUST_CACHE_MS
    ) {
      return {
        trusted: this.sslTrustCache.trusted,
        caCertPath: this.sslTrustCache.caCertPath,
      };
    }
    const trusted = isDevMgrCaTrusted(certs.caCertPath);
    this.sslTrustCache = { trusted, caCertPath: certs.caCertPath, checkedAt: now };
    return { trusted, caCertPath: certs.caCertPath };
  }

  private getPortConflictWarning(): string | undefined {
    const now = Date.now();
    if (this.portConflictCache && now - this.portConflictCache.checkedAt < PORT_CONFLICT_CACHE_MS) {
      return this.portConflictCache.message;
    }
    const message = detectWebPortConflict(this.config);
    this.portConflictCache = { message, checkedAt: now };
    return message;
  }

  /** Lightweight status for dashboard polling (no certutil / port scans). */
  async statusLive() {
    return {
      services: this.runtimeServiceStatuses(),
      bundledServices: await this.getBundledServices(),
    };
  }

  async trustSslCertificate(): Promise<{ ok: boolean; message: string }> {
    this.sslTrustCache = null;
    const certs = ensureDevCerts(collectTlsSanNames(this.config, this.sites));
    ensureFullChainCert();
    try {
      await this.helper.certInstall(certs.caCertPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isDevMgrCaTrusted(certs.caCertPath)) {
        return { ok: false, message: msg };
      }
    }
    try {
      installRootCertCurrentUser(certs.caCertPath);
    } catch {
      // user store may already contain the CA
    }
    try {
      reloadNginx(this.config);
    } catch {
      // nginx may be stopped
    }
    if (isDevMgrCaTrusted(certs.caCertPath)) {
      return {
        ok: true,
        message:
          'Dev-mgr CA is trusted and nginx is using the full certificate chain. Fully quit and reopen your browser, then open https://your-site.test again.',
      };
    }
    return {
      ok: false,
      message:
        'Could not verify the CA in Trusted Root. Approve the UAC prompt, click Trust again, then restart your browser.',
    };
  }

  async status() {
    const warnings: string[] = [];
    const portConflict = this.getPortConflictWarning();
    if (portConflict) warnings.push(portConflict);

    const ssl = this.getSslTrustStatus();
    if (!ssl.trusted) {
      warnings.push(
        'HTTPS is not trusted yet. Open Settings → HTTPS and click “Trust SSL certificate” (UAC prompt), then restart your browser.',
      );
    }

    return {
      dataDir: getDataDir(),
      logsDir: getLogsDir(),
      configPath: getConfigPath(),
      projectsDir: getProjectsDir(),
      hostsPath: getHostsPath(),
      webServer: this.config.general.web_server,
      sites: this.sites,
      ssl,
      warnings,
      services: this.runtimeServiceStatuses(),
      bundledServices: await this.getBundledServices(),
    };
  }

  private resolveServiceNames(services?: string[]): string[] {
    if (!services || services.length === 0) {
      return this.getInstalledStartableNames();
    }
    return services;
  }

  /** Stop processes that are running but excluded from autostart / Start all. */
  private async stopDisabledRunningServices(): Promise<void> {
    for (const name of SERVICE_START_ORDER) {
      if (this.isServiceEnabled(name)) continue;
      try {
        const svc = this.getService(name);
        if (!svc.isConfigured || svc.status.state !== 'running') continue;
        if (name === 'php-fpm') {
          this.markPhpAutoRestart(false);
        }
        await svc.stop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dev-mgr] stop disabled ${name}:`, msg);
      }
    }
  }

  private isServiceEnabled(name: string): boolean {
    const s = this.config.services;
    switch (name) {
      case 'nginx':
        return s.nginx.enabled !== false;
      case 'apache':
        return s.apache.enabled !== false;
      case 'php-fpm':
      case 'php':
        return s.php.enabled !== false;
      case 'mysql':
        return s.mysql.enabled !== false;
      case 'postgres':
        return s.postgres.enabled !== false;
      case 'redis':
        return s.redis.enabled !== false;
      case 'mailpit':
        return s.mailpit.enabled !== false;
      case 'mongodb':
        return s.mongodb.enabled !== false;
      default:
        return false;
    }
  }

  private getService(name: string) {
    switch (name) {
      case 'nginx':
        return this.services.nginx;
      case 'apache':
        return this.services.apache;
      case 'php-fpm':
      case 'php':
        return this.services.phpFpm;
      case 'mysql':
        return this.services.mysql;
      case 'postgres':
        return this.services.postgres;
      case 'redis':
        return this.services.redis;
      case 'nodejs':
        return this.services.nodejs;
      case 'mailpit':
        return this.services.mailpit;
      case 'mongodb':
        return this.services.mongodb;
      default:
        throw new Error(`unknown service: ${name}`);
    }
  }
}
