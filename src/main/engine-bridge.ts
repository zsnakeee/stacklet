import fs from 'fs';
import path from 'path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { Orchestrator, type AppSettingsPatch, type BootstrapPhase } from '../engine/orchestrator';
import type { BundledServiceId } from '../bundled/types';
import { getDataDir } from '../shared/paths';
import { openLogWindow } from './log-window';

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
  if (process.env['DEVMGR_SKIP_AUTOSTART'] === '1') return;

  const notify = (phase: BootstrapPhase): void => {
    getWindow()?.webContents.send('devmgr:bootstrap:phase', phase);
  };

  try {
    await getEngine().bootstrapOnLaunch((phase) => notify(phase));
    notify('ready');
    getWindow()?.webContents.send('devmgr:bootstrap:done');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dev-mgr] autostart:', msg);
    notify('ready');
    getWindow()?.webContents.send('devmgr:bootstrap:done', { error: msg });
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
  ipcMain.handle('devmgr:shell:openExternal', async (_e, url: string) => {
    await openExternalHttpUrl(url);
  });
  ipcMain.handle('devmgr:status', async () => getEngine().status());
  ipcMain.handle('devmgr:status:live', async () => getEngine().statusLive());
  ipcMain.handle('devmgr:sites', () => getEngine().getSites());
  ipcMain.handle('devmgr:config', () => getEngine().getConfig());
  ipcMain.handle('devmgr:settings:paths', () => getEngine().getAppPaths());
  ipcMain.handle('devmgr:settings:save', async (_e, patch: AppSettingsPatch) => {
    await getEngine().saveAppSettings(patch);
    return { config: getEngine().getConfig(), status: await getEngine().status() };
  });
  ipcMain.handle('devmgr:ssl:status', () => getEngine().getSslTrustStatus());
  ipcMain.handle('devmgr:ssl:trust', async () => getEngine().trustSslCertificate());
  ipcMain.handle('devmgr:env:info', () => getEngine().getEnvironmentInfo());
  ipcMain.handle('devmgr:env:sync', async () => getEngine().syncEnvironmentPath());
  ipcMain.handle('devmgr:env:restart', async (_e, openTerminal?: boolean) =>
    getEngine().restartEnvironment(openTerminal !== false),
  );
  ipcMain.handle('devmgr:settings:openPath', async (_e, targetPath: string) => {
    const root = path.resolve(getDataDir());
    const resolved = path.resolve(targetPath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error('Path is outside the dev-mgr data directory');
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
  ipcMain.handle('devmgr:apply', async () => {
    await getEngine().apply();
    return getEngine().status();
  });
  ipcMain.handle('devmgr:hosts:status', () => getEngine().getHostsSyncStatus());
  ipcMain.handle('devmgr:hosts:sync', async () => {
    const result = await getEngine().syncHostsIfNeeded();
    return { ...result, status: await getEngine().status() };
  });
  ipcMain.handle('devmgr:start', async () => {
    await getEngine().start();
    return getEngine().status();
  });
  ipcMain.handle('devmgr:stop', async () => {
    await getEngine().stop();
    return getEngine().status();
  });
  ipcMain.handle('devmgr:service:start', async (_e, name: string) => {
    await getEngine().startService(name);
    return getEngine().status();
  });
  ipcMain.handle('devmgr:service:stop', async (_e, name: string) => {
    await getEngine().stopService(name);
    return getEngine().status();
  });
  ipcMain.handle('devmgr:php:versions', () => getEngine().listPhpVersions());
  ipcMain.handle('devmgr:php:default', () => getEngine().getDefaultPhpVersion());
  ipcMain.handle('devmgr:php:setDefault', async (_e, version: string) => {
    await getEngine().setDefaultPhpVersion(version);
    return getEngine().status();
  });
  ipcMain.handle('devmgr:php:settings', (_e, version?: string) =>
    getEngine().getPhpSettings(version),
  );
  ipcMain.handle(
    'devmgr:php:saveSettings',
    async (_e, patch: Record<string, string>, version?: string) => {
      await getEngine().savePhpSettings(patch, version);
      return getEngine().getPhpSettings(version);
    },
  );
  ipcMain.handle('devmgr:php:openIni', (_e, version?: string) => {
    getEngine().openPhpIni(version);
  });
  ipcMain.handle('devmgr:php:extensions', (_e, version?: string) =>
    getEngine().getPhpExtensions(version),
  );
  ipcMain.handle(
    'devmgr:php:setExtension',
    async (_e, name: string, enabled: boolean, version?: string) => {
      await getEngine().setPhpExtension(name, enabled, version);
      return getEngine().getPhpExtensions(version);
    },
  );
  ipcMain.handle('devmgr:php:enableRecommended', async (_e, version?: string) => {
    await getEngine().enableRecommendedPhpExtensions(version);
    return getEngine().getPhpExtensions(version);
  });
  ipcMain.handle('devmgr:php:peclInstallable', (_e, version?: string) =>
    getEngine().getPhpPeclInstallable(version),
  );
  ipcMain.handle('devmgr:php:installPecl', async (_e, peclName: string, version?: string) => {
    await getEngine().installPhpPeclExtension(peclName, version);
    return {
      extensions: getEngine().getPhpExtensions(version),
      pecl: getEngine().getPhpPeclInstallable(version),
    };
  });
  ipcMain.handle('devmgr:services:installedVersions', (_e, serviceId: string) =>
    getEngine().listInstalledVersions(serviceId as BundledServiceId),
  );
  ipcMain.handle('devmgr:services:versionInfo', (_e, serviceId: string, version: string) =>
    getEngine().getServiceVersionInfo(serviceId as BundledServiceId, version),
  );
  ipcMain.handle('devmgr:services:setActive', async (_e, serviceId: string, version: string) => {
    await getEngine().setActiveBundledVersion(serviceId as BundledServiceId, version);
    return getEngine().status();
  });
  ipcMain.handle('devmgr:mysql:settings', (_e, version?: string) =>
    getEngine().getMysqlSettings(version),
  );
  ipcMain.handle(
    'devmgr:mysql:saveSettings',
    async (_e, patch: Record<string, string | number | boolean>, version?: string) => {
      await getEngine().saveMysqlSettings(patch, version);
      return getEngine().getMysqlSettings(version);
    },
  );
  ipcMain.handle('devmgr:mysql:openIni', (_e, version?: string) => {
    getEngine().openMysqlIni(version);
  });
  ipcMain.handle('devmgr:mysql:restart', async () => {
    await getEngine().restartMysql();
    return getEngine().status();
  });
  ipcMain.handle('devmgr:phpmyadmin:settings', (_e, version?: string) =>
    getEngine().getPhpMyAdminSettings(version),
  );
  ipcMain.handle(
    'devmgr:phpmyadmin:saveSettings',
    async (_e, patch: Record<string, string | number | boolean>, version?: string) => {
      await getEngine().savePhpMyAdminSettings(patch, version);
      return getEngine().getPhpMyAdminSettings(version);
    },
  );
  ipcMain.handle('devmgr:phpmyadmin:openConfig', (_e, version?: string) => {
    getEngine().openPhpMyAdminConfig(version);
  });
  ipcMain.handle('devmgr:nginx:settings', (_e, version?: string) =>
    getEngine().getNginxSettings(version),
  );
  ipcMain.handle(
    'devmgr:nginx:saveSettings',
    async (_e, patch: Record<string, string | number | boolean>, version?: string) => {
      await getEngine().saveNginxSettings(patch, version);
      return getEngine().getNginxSettings(version);
    },
  );
  ipcMain.handle('devmgr:nginx:openConf', (_e, version?: string) => {
    getEngine().openNginxConf(version);
  });
  ipcMain.handle('devmgr:nginx:restart', async () => {
    await getEngine().restartNginx();
    return getEngine().status();
  });
  ipcMain.handle('devmgr:php:restart', async () => {
    await getEngine().restartPhp();
    return getEngine().status();
  });
  ipcMain.handle('devmgr:park', async (_e, directory: string) => {
    getEngine().park(directory);
    return getEngine().status();
  });
  ipcMain.handle('devmgr:sites:remove', async (_e, name: string) => {
    const sites = await getEngine().removeSite(name);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('devmgr:sites:createLaravel', async (_e, name: string) => {
    const sites = await getEngine().createLaravelSite(name);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle(
    'devmgr:sites:linkExisting',
    async (_e, sourcePath: string, projectName?: string) => {
      const sites = await getEngine().linkExistingSite(sourcePath, projectName);
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle('devmgr:sites:cloneGit', async (_e, url: string, name?: string) => {
    const sites = await getEngine().cloneGitSite(url, name);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('devmgr:sites:setEnabled', async (_e, name: string, enabled: boolean) => {
    const sites = await getEngine().setSiteEnabled(name, enabled);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('devmgr:sites:setFavorite', async (_e, name: string, favorite: boolean) => {
    const sites = await getEngine().setSiteFavorite(name, favorite);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle(
    'devmgr:sites:setDomain',
    async (_e, name: string, domain: string | null, aliases: string[]) => {
      const sites = await getEngine().setSiteDomain(name, domain, aliases ?? []);
      return { sites, status: await getEngine().status() };
    },
  );
  ipcMain.handle('devmgr:sites:detail', (_e, name: string) =>
    getEngine().getSiteDetailByName(name),
  );
  ipcMain.handle('devmgr:sites:openInExplorer', async (_e, name: string) => {
    const site = getEngine().getSites().find((s) => s.name === name);
    if (!site) throw new Error(`Site not found: ${name}`);
    const err = await shell.openPath(site.root);
    if (err) throw new Error(err);
  });
  ipcMain.handle('devmgr:sites:artisan', async (_e, name: string, args: string[]) =>
    getEngine().runSiteArtisan(name, args),
  );
  ipcMain.handle('devmgr:sites:resolveLog', (_e, name: string) =>
    getEngine().resolveLogIdForSite(name),
  );
  ipcMain.handle('devmgr:dialog:directory', async () => {
    const win = getWindow();
    const opts = { properties: ['openDirectory'] as ('openDirectory')[] };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('devmgr:logs:list', () => getEngine().logs.listSources());
  ipcMain.handle('devmgr:logs:tail', (_e, id: string, lines: number) =>
    getEngine().logs.readTail(id, lines ?? 50),
  );
  ipcMain.handle('devmgr:logs:resolveForService', (_e, bundledId: string) =>
    getEngine().resolveLogIdForService(bundledId),
  );
  ipcMain.handle('devmgr:logs:open', (_e, id: string, label: string) => {
    openLogWindow(id, label);
  });

  ipcMain.handle('devmgr:logs:follow', (e, id: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    getEngine().logs.follow(id, ({ id: sourceId, chunk }) => {
      win.webContents.send('devmgr:logs:append', { id: sourceId, chunk });
    });
  });

  ipcMain.handle('devmgr:logs:unfollow', (_e, id: string) => {
    getEngine().logs.unfollow(id);
  });

  ipcMain.handle('devmgr:services:catalog', async () =>
    getEngine().getBundledServices(),
  );

  ipcMain.handle('devmgr:services:refresh', async () => {
    await getEngine().refreshCatalog();
    return getEngine().getBundledServices();
  });

  ipcMain.handle(
    'devmgr:services:install',
    async (_e, serviceId: string, version: string) => {
      const win = getWindow();
      await getEngine().installBundled(
        serviceId as BundledServiceId,
        version,
        (progress) => {
          win?.webContents.send('devmgr:install:progress', progress);
        },
      );
      return getEngine().status();
    },
  );

  ipcMain.handle(
    'devmgr:services:update',
    async (_e, serviceId: string, version: string) => {
      const win = getWindow();
      await getEngine().updateBundled(
        serviceId as BundledServiceId,
        version,
        (progress) => {
          win?.webContents.send('devmgr:install:progress', progress);
        },
      );
      return getEngine().status();
    },
  );

  ipcMain.handle('devmgr:services:uninstall', async (_e, serviceId: string) => {
    const win = getWindow();
    await getEngine().uninstallBundled(serviceId as BundledServiceId, (progress) => {
      win?.webContents.send('devmgr:install:progress', progress);
    });
    return getEngine().status();
  });
}
