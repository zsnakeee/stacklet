import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { Orchestrator, type AppSettingsPatch, type BootstrapPhase } from '../engine/orchestrator';
import type { BundledServiceId } from '../bundled/types';
import { getDataDir } from '../shared/paths';
import { readEnv } from '../shared/brand';
import { openLogWindow } from './log-window';
import { runEngineWork } from './engine-work';

let engine: Orchestrator | null = null;

export function getEngine(): Orchestrator {
  if (!engine) {
    engine = Orchestrator.createInitialized();
  }
  return engine;
}

/** Stop all services and release resources before the process exits. */
export async function shutdownEngineOnQuit(): Promise<void> {
  const engine = getEngine();
  engine.logs.unfollowAll();
  await engine.stopAllOnQuit();
  engine.disconnectHelper();
}

/** Apply config and start installed services when the app opens. */
export async function bootstrapEngineOnLaunch(
  getWindow: () => BrowserWindow | null,
): Promise<void> {
  if (readEnv('SKIP_AUTOSTART') === '1') return;

  const notify = (phase: BootstrapPhase): void => {
    getWindow()?.webContents.send('stacklet:bootstrap:phase', phase);
  };

  // Let the renderer finish its first paint + statusLive IPC before heavy work.
  await new Promise<void>((resolve) => setImmediate(resolve));

  try {
    await runEngineWork(() => getEngine().bootstrapOnLaunch((phase) => notify(phase)));
    notify('ready');
    getWindow()?.webContents.send('stacklet:bootstrap:done');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dev-mgr] autostart:', msg);
    notify('ready');
    getWindow()?.webContents.send('stacklet:bootstrap:done', { error: msg });
  }
}

function openExternalHttpUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }
  return shell.openExternal(parsed.toString());
}

export function registerEngineIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('stacklet:shell:openExternal', async (_e, url: string) => {
    await openExternalHttpUrl(url);
  });
  ipcMain.handle('stacklet:status', async () =>
    runEngineWork(() => getEngine().status()),
  );
  ipcMain.handle('stacklet:status:live', async () => getEngine().statusLive());
  ipcMain.handle('stacklet:sites', () => getEngine().getSites());
  ipcMain.handle('stacklet:config', () => getEngine().getConfig());
  ipcMain.handle('stacklet:settings:paths', () => getEngine().getAppPaths());
  ipcMain.handle('stacklet:settings:save', async (_e, patch: AppSettingsPatch) => {
    await getEngine().saveAppSettings(patch);
    if (patch.general?.launch_on_login !== undefined) {
      try {
        app.setLoginItemSettings({ openAtLogin: patch.general.launch_on_login });
      } catch {
        // best-effort
      }
    }
    return { config: getEngine().getConfig(), status: await getEngine().status() };
  });
  ipcMain.handle('stacklet:ssl:status', async () => getEngine().getSslTrustStatusAsync());
  ipcMain.handle('stacklet:ssl:trust', async () =>
    runEngineWork(() => getEngine().trustSslCertificate()),
  );
  ipcMain.handle('stacklet:env:info', () => getEngine().getEnvironmentInfo());
  ipcMain.handle('stacklet:env:sync', async () => getEngine().syncEnvironmentPath());
  ipcMain.handle('stacklet:env:restart', async (_e, openTerminal?: boolean) =>
    getEngine().restartEnvironment(openTerminal !== false),
  );
  ipcMain.handle('stacklet:composer:status', () => getEngine().getComposerStatus());
  ipcMain.handle('stacklet:composer:install', async () => getEngine().installComposer());
  ipcMain.handle('stacklet:ngrok:status', () => getEngine().getNgrokStatus());
  ipcMain.handle('stacklet:ngrok:install', async () => {
    const win = getWindow();
    return getEngine().installNgrok((message) => {
      win?.webContents.send('stacklet:ngrok:progress', message);
    });
  });
  ipcMain.handle('stacklet:ngrok:setAuthToken', async (_e, token: string) =>
    getEngine().setNgrokAuthToken(token),
  );
  ipcMain.handle('stacklet:ngrok:setPath', async (_e, exePath: string) =>
    getEngine().setNgrokPath(exePath),
  );
  ipcMain.handle('stacklet:cmder:status', () => getEngine().getCmderStatus());
  ipcMain.handle('stacklet:cmder:install', async () => {
    const win = getWindow();
    return getEngine().installCmder((message) => {
      win?.webContents.send('stacklet:cmder:progress', message);
    });
  });
  ipcMain.handle('stacklet:settings:openPath', async (_e, targetPath: string) => {
    const root = path.resolve(getDataDir());
    const resolved = path.resolve(targetPath);
    // Allow the data dir tree plus a few known-safe system files (e.g. hosts).
    const hostsPath = path.resolve(
      process.env['WINDIR'] ?? 'C:\\Windows',
      'System32',
      'drivers',
      'etc',
      'hosts',
    );
    const allowed =
      resolved === root ||
      resolved.startsWith(root + path.sep) ||
      resolved.toLowerCase() === hostsPath.toLowerCase();
    if (!allowed) {
      throw new Error('Path is outside the Stacklet data directory');
    }
    if (!fs.existsSync(resolved)) {
      throw new Error('Path does not exist');
    }
    if (fs.statSync(resolved).isFile()) {
      shell.showItemInFolder(resolved);
      return;
    }
    const err = await shell.openPath(resolved);
    if (err) throw new Error(err);
  });
  ipcMain.handle('stacklet:apply', async () =>
    runEngineWork(async () => {
      await getEngine().apply({ backgroundPhpMaintenance: true, syncPath: false });
      return getEngine().status();
    }),
  );
  ipcMain.handle('stacklet:reloadAll', async () => runEngineWork(() => getEngine().reloadAll()));
  ipcMain.handle('stacklet:setWebServer', async (_e, server: 'nginx' | 'apache') => {
    await getEngine().setWebServer(server);
    return getEngine().status();
  });
  ipcMain.handle('stacklet:setTld', async (_e, tld: string) => {
    await getEngine().setTld(tld);
    return getEngine().status();
  });
  ipcMain.handle('stacklet:settings:relocateDataDir', async (_e, newDir: string) =>
    getEngine().relocateDataDir(newDir),
  );
  ipcMain.handle('stacklet:settings:useExistingDataDir', async (_e, dir: string) =>
    getEngine().useExistingDataDir(dir),
  );
  ipcMain.handle('stacklet:settings:setProjectsDir', async (_e, dir: string | null) => {
    await getEngine().setProjectsDir(dir);
    return { config: getEngine().getConfig(), status: await getEngine().status() };
  });
  ipcMain.handle('stacklet:hosts:status', () => getEngine().getHostsSyncStatus());
  ipcMain.handle('stacklet:hosts:sync', async () => {
    const result = await getEngine().syncHostsIfNeeded();
    return { ...result, status: await getEngine().status() };
  });
  ipcMain.handle('stacklet:start', async () =>
    runEngineWork(async () => {
      await getEngine().start();
      return getEngine().status();
    }),
  );
  ipcMain.handle('stacklet:stop', async () =>
    runEngineWork(async () => {
      await getEngine().stop();
      return getEngine().status();
    }),
  );
  ipcMain.handle('stacklet:service:start', async (_e, name: string) =>
    runEngineWork(async () => {
      await getEngine().startService(name);
      return getEngine().status();
    }),
  );
  ipcMain.handle('stacklet:service:stop', async (_e, name: string) =>
    runEngineWork(async () => {
      await getEngine().stopService(name);
      return getEngine().status();
    }),
  );
  ipcMain.handle('stacklet:php:versions', () => getEngine().listPhpVersions());
  ipcMain.handle('stacklet:php:default', () => getEngine().getDefaultPhpVersion());
  ipcMain.handle('stacklet:php:setDefault', async (_e, version: string) => {
    await getEngine().setDefaultPhpVersion(version);
    return getEngine().status();
  });
  ipcMain.handle('stacklet:php:settings', (_e, version?: string) =>
    getEngine().getPhpSettings(version),
  );
  ipcMain.handle(
    'stacklet:php:saveSettings',
    async (_e, patch: Record<string, string>, version?: string) => {
      await getEngine().savePhpSettings(patch, version);
      return getEngine().getPhpSettings(version);
    },
  );
  ipcMain.handle('stacklet:php:openIni', (_e, version?: string) => {
    getEngine().openPhpIni(version);
  });
  ipcMain.handle('stacklet:php:extensions', (_e, version?: string) =>
    getEngine().getPhpExtensions(version),
  );
  ipcMain.handle(
    'stacklet:php:setExtension',
    async (_e, name: string, enabled: boolean, version?: string) => {
      await getEngine().setPhpExtension(name, enabled, version);
      return getEngine().getPhpExtensions(version);
    },
  );
  ipcMain.handle('stacklet:php:enableRecommended', async (_e, version?: string) => {
    await getEngine().enableRecommendedPhpExtensions(version);
    return getEngine().getPhpExtensions(version);
  });
  ipcMain.handle('stacklet:php:peclInstallable', (_e, version?: string) =>
    getEngine().getPhpPeclInstallable(version),
  );
  ipcMain.handle('stacklet:php:installPecl', async (_e, peclName: string, version?: string) => {
    await getEngine().installPhpPeclExtension(peclName, version);
    return {
      extensions: getEngine().getPhpExtensions(version),
      pecl: getEngine().getPhpPeclInstallable(version),
    };
  });
  ipcMain.handle('stacklet:services:installedVersions', (_e, serviceId: string) =>
    getEngine().listInstalledVersions(serviceId as BundledServiceId),
  );
  ipcMain.handle('stacklet:services:versionInfo', (_e, serviceId: string, version: string) =>
    getEngine().getServiceVersionInfo(serviceId as BundledServiceId, version),
  );
  ipcMain.handle('stacklet:services:setActive', async (_e, serviceId: string, version: string) => {
    await getEngine().setActiveBundledVersion(serviceId as BundledServiceId, version);
    return getEngine().status();
  });
  ipcMain.handle('stacklet:mysql:settings', (_e, version?: string) =>
    getEngine().getMysqlSettings(version),
  );
  ipcMain.handle(
    'stacklet:mysql:saveSettings',
    async (_e, patch: Record<string, string | number | boolean>, version?: string) => {
      await getEngine().saveMysqlSettings(patch, version);
      return getEngine().getMysqlSettings(version);
    },
  );
  ipcMain.handle('stacklet:mysql:openIni', (_e, version?: string) => {
    getEngine().openMysqlIni(version);
  });
  ipcMain.handle('stacklet:mysql:restart', async () => {
    await getEngine().restartMysql();
    return getEngine().status();
  });
  ipcMain.handle('stacklet:phpmyadmin:settings', (_e, version?: string) =>
    getEngine().getPhpMyAdminSettings(version),
  );
  ipcMain.handle(
    'stacklet:phpmyadmin:saveSettings',
    async (_e, patch: Record<string, string | number | boolean>, version?: string) => {
      await getEngine().savePhpMyAdminSettings(patch, version);
      return getEngine().getPhpMyAdminSettings(version);
    },
  );
  ipcMain.handle('stacklet:phpmyadmin:openConfig', (_e, version?: string) => {
    getEngine().openPhpMyAdminConfig(version);
  });
  ipcMain.handle('stacklet:nginx:settings', (_e, version?: string) =>
    getEngine().getNginxSettings(version),
  );
  ipcMain.handle(
    'stacklet:nginx:saveSettings',
    async (_e, patch: Record<string, string | number | boolean>, version?: string) => {
      await getEngine().saveNginxSettings(patch, version);
      return getEngine().getNginxSettings(version);
    },
  );
  ipcMain.handle('stacklet:nginx:openConf', (_e, version?: string) => {
    getEngine().openNginxConf(version);
  });
  ipcMain.handle('stacklet:nginx:restart', async () => {
    await getEngine().restartNginx();
    return getEngine().status();
  });
  ipcMain.handle('stacklet:ports:get', () => getEngine().getServicePorts());
  ipcMain.handle('stacklet:ports:set', async (_e, patch: Record<string, number>) => {
    await getEngine().setServicePorts(patch);
    return { ports: getEngine().getServicePorts(), status: await getEngine().status() };
  });
  ipcMain.handle('stacklet:redis:settings', () => getEngine().getRedisSettings());
  ipcMain.handle(
    'stacklet:redis:saveSettings',
    async (
      _e,
      patch: {
        port?: number;
        password?: string;
        maxmemory?: string;
        maxmemoryPolicy?: string;
        appendonly?: boolean;
      },
    ) => {
      await getEngine().saveRedisSettings(patch);
      return getEngine().getRedisSettings();
    },
  );
  ipcMain.handle('stacklet:redis:openConf', () => {
    getEngine().openRedisConf();
  });
  ipcMain.handle('stacklet:redis:restart', async () => {
    await getEngine().restartRedis();
    return getEngine().status();
  });
  ipcMain.handle('stacklet:php:restart', async () => {
    await getEngine().restartPhp();
    return getEngine().status();
  });
  ipcMain.handle('stacklet:park', async (_e, directory: string) => {
    getEngine().park(directory);
    return getEngine().status();
  });
  ipcMain.handle('stacklet:sites:remove', async (_e, name: string) => {
    const sites = await getEngine().removeSite(name);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('stacklet:sites:createLaravel', async (_e, name: string) => {
    const win = getWindow();
    const sites = await getEngine().createLaravelSite(name, (message) => {
      win?.webContents.send('stacklet:sites:createProgress', { name, message });
    });
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle(
    'stacklet:sites:linkExisting',
    async (_e, sourcePath: string, projectName?: string) => {
      const sites = await getEngine().linkExistingSite(sourcePath, projectName);
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle('stacklet:sites:laragonDir', () => getEngine().laragonProjectsDir());
  ipcMain.handle('stacklet:sites:laragonRoot', () => getEngine().laragonRootDir());
  ipcMain.handle(
    'stacklet:sites:migrateLaragon',
    async (_e, projectsDir: string, rootPath?: string) => {
      const win = getWindow();
      const result = await getEngine().migrateFromLaragon(projectsDir, rootPath, (message) => {
        win?.webContents.send('stacklet:sites:migrateProgress', message);
      });
      return { ...result, status: await getEngine().status() };
    },
  );
  ipcMain.handle('stacklet:sites:cloneGit', async (_e, url: string, name?: string) => {
    const sites = await getEngine().cloneGitSite(url, name);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('stacklet:sites:setEnabled', async (_e, name: string, enabled: boolean) => {
    const sites = await getEngine().setSiteEnabled(name, enabled);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('stacklet:sites:setFavorite', async (_e, name: string, favorite: boolean) => {
    const sites = await getEngine().setSiteFavorite(name, favorite);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle(
    'stacklet:sites:setDomain',
    async (_e, name: string, domain: string | null, aliases: string[]) => {
      const sites = await getEngine().setSiteDomain(name, domain, aliases ?? []);
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle(
    'stacklet:sites:setDocRoot',
    async (_e, name: string, docRoot: string | null) => {
      const sites = await getEngine().setSiteDocRoot(name, docRoot);
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle(
    'stacklet:sites:setRewrite',
    async (_e, name: string, patch: { rewrite?: string; nginx_extra?: string }) => {
      const sites = await getEngine().setSiteRewrite(
        name,
        patch as { rewrite?: 'laravel' | 'wordpress' | 'static' | 'spa'; nginx_extra?: string },
      );
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle('stacklet:sites:openWebConfig', (_e, name: string) =>
    getEngine().openSiteWebConfig(name),
  );
  ipcMain.handle(
    'stacklet:sites:setPhpVersion',
    async (_e, name: string, version: string | null) => {
      const sites = await getEngine().setSitePhpVersion(name, version);
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle('stacklet:sites:detail', (_e, name: string) =>
    getEngine().getSiteDetailByName(name),
  );
  ipcMain.handle('stacklet:sites:openInExplorer', async (_e, name: string) => {
    const site = getEngine().getSites().find((s) => s.name === name);
    if (!site) throw new Error(`Site not found: ${name}`);
    const err = await shell.openPath(site.root);
    if (err) throw new Error(err);
  });
  ipcMain.handle('stacklet:sites:artisan', async (_e, name: string, args: string[]) =>
    getEngine().runSiteArtisan(name, args),
  );
  ipcMain.handle(
    'stacklet:sites:setReverb',
    async (_e, name: string, patch: { enabled?: boolean; port?: number | null }) => {
      const sites = await getEngine().setSiteReverb(name, patch);
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle('stacklet:sites:reverbStatus', (_e, name: string) =>
    getEngine().getSiteReverbStatus(name),
  );
  ipcMain.handle('stacklet:sites:applyReverbEnv', async (_e, name: string) => {
    const updatedKeys = await getEngine().applySiteReverbEnv(name);
    return { updatedKeys, detail: getEngine().getSiteDetailByName(name) };
  });
  ipcMain.handle('stacklet:sites:restartReverb', async (_e, name: string) => {
    await getEngine().restartSiteReverb(name);
    return { detail: getEngine().getSiteDetailByName(name) };
  });
  ipcMain.handle('stacklet:sites:tinker', async (_e, name: string) =>
    getEngine().openSiteTinker(name),
  );
  ipcMain.handle('stacklet:sites:terminal', async (_e, name: string) =>
    getEngine().openSiteTerminal(name),
  );
  ipcMain.handle('stacklet:sites:share', async (_e, name: string) =>
    getEngine().openSiteShare(name),
  );
  ipcMain.handle('stacklet:sites:resolveLog', (_e, name: string) =>
    getEngine().resolveLogIdForSite(name),
  );

  // ---- Node / nvm-windows ----
  ipcMain.handle('stacklet:node:nvmStatus', () => getEngine().nvmStatus());
  ipcMain.handle('stacklet:node:nvmInstallSelf', async () => {
    try {
      return { ok: true, output: await getEngine().installNvm() };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('stacklet:node:nvmAvailable', () => getEngine().nvmAvailable());
  ipcMain.handle('stacklet:node:nvmInstall', async (_e, version: string) => {
    try {
      return { ok: true, output: await getEngine().nvmInstall(version) };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('stacklet:node:nvmUse', async (_e, version: string) => {
    try {
      return { ok: true, output: await getEngine().nvmUse(version) };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('stacklet:node:siteInfo', (_e, name: string) =>
    getEngine().getSiteNodeInfo(name),
  );
  ipcMain.handle('stacklet:dialog:directory', async (_e, defaultPath?: string) => {
    const win = getWindow();
    const opts = {
      properties: ['openDirectory'] as ('openDirectory')[],
      ...(defaultPath ? { defaultPath } : {}),
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('stacklet:dialog:file', async (_e, opts?: { name?: string; extensions?: string[] }) => {
    const win = getWindow();
    const dialogOpts = {
      properties: ['openFile'] as ('openFile')[],
      filters: opts?.extensions
        ? [{ name: opts.name ?? 'Files', extensions: opts.extensions }]
        : undefined,
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('stacklet:logs:list', () => getEngine().logs.listSources());
  ipcMain.handle('stacklet:logs:tail', (_e, id: string, lines: number) =>
    getEngine().logs.readTail(id, lines ?? 50),
  );
  ipcMain.handle('stacklet:logs:resolveForService', (_e, bundledId: string) =>
    getEngine().resolveLogIdForService(bundledId),
  );
  ipcMain.handle('stacklet:logs:open', (_e, id: string, label: string) => {
    openLogWindow(id, label);
  });

  ipcMain.handle('stacklet:logs:follow', (e, id: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    getEngine().logs.follow(id, ({ id: sourceId, chunk }) => {
      win.webContents.send('stacklet:logs:append', { id: sourceId, chunk });
    });
  });

  ipcMain.handle('stacklet:logs:unfollow', (_e, id: string) => {
    getEngine().logs.unfollow(id);
  });

  ipcMain.handle('stacklet:services:catalog', async () =>
    getEngine().getBundledServices(),
  );

  ipcMain.handle('stacklet:services:refresh', async () => {
    await getEngine().refreshCatalog();
    return getEngine().getBundledServices();
  });

  ipcMain.handle(
    'stacklet:services:install',
    async (_e, serviceId: string, version: string) => {
      const win = getWindow();
      await getEngine().installBundled(
        serviceId as BundledServiceId,
        version,
        (progress) => {
          win?.webContents.send('stacklet:install:progress', progress);
        },
      );
      return getEngine().status();
    },
  );

  ipcMain.handle(
    'stacklet:services:update',
    async (_e, serviceId: string, version: string) => {
      const win = getWindow();
      await getEngine().updateBundled(
        serviceId as BundledServiceId,
        version,
        (progress) => {
          win?.webContents.send('stacklet:install:progress', progress);
        },
      );
      return getEngine().status();
    },
  );

  ipcMain.handle('stacklet:services:uninstall', async (_e, serviceId: string) => {
    const win = getWindow();
    await getEngine().uninstallBundled(serviceId as BundledServiceId, (progress) => {
      win?.webContents.send('stacklet:install:progress', progress);
    });
    return getEngine().status();
  });
}
