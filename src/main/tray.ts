import path from 'path';
import { app, Menu, Tray, nativeImage, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { BRAND } from '../shared/brand';
import { getEngine } from './engine-bridge';

let tray: Tray | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function trayIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png');
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    return nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );
  }
  return img.resize({ width: 16, height: 16 });
}

/** Friendly display label for a runtime service name. */
const SERVICE_LABELS: Record<string, string> = {
  nginx: 'NGINX',
  apache: 'Apache',
  'php-fpm': 'PHP',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  mongodb: 'MongoDB',
  mailpit: 'Mailpit',
};

function serviceLabel(name: string): string {
  return SERVICE_LABELS[name] ?? name;
}

export function createTray(showWindow: () => void, navigateTo: (route: string) => void): Tray {
  tray = new Tray(trayIcon());
  tray.setToolTip(BRAND.name);

  const rebuildMenu = async (): Promise<void> => {
    let services: { name: string; state: string }[] = [];
    let phpVersions: string[] = [];
    let activePhp = '';
    let dataDir = '';
    try {
      const st = await getEngine().status();
      services = (st.services ?? []) as { name: string; state: string }[];
      dataDir = st.dataDir ?? getEngine().getAppPaths().dataDir;
    } catch {
      // engine not ready — show a minimal menu
    }
    try {
      phpVersions = getEngine().listPhpVersions();
      activePhp = getEngine().getDefaultPhpVersion();
    } catch {
      // PHP not installed yet
    }

    const running = services.filter((s) => s.state === 'running').length;

    // One submenu per service: status + Start/Stop + Logs.
    const serviceItems: MenuItemConstructorOptions[] = services.map((s) => {
      const isRunning = s.state === 'running';
      return {
        label: `${isRunning ? '●' : '○'}  ${serviceLabel(s.name)}${isRunning ? '' : '  (stopped)'}`,
        submenu: [
          {
            label: isRunning ? 'Stop' : 'Start',
            click: async () => {
              try {
                if (isRunning) await getEngine().stopService(s.name);
                else await getEngine().startService(s.name);
              } catch {
                // surfaced in the app UI
              }
              await rebuildMenu();
            },
          },
          { label: 'View logs', click: () => navigateTo('/logs') },
          { label: 'Details', click: () => navigateTo('/services') },
        ],
      };
    });

    // PHP version radio (only when more than one is installed).
    const phpItems: MenuItemConstructorOptions[] =
      phpVersions.length > 0
        ? phpVersions.map((v) => ({
            label: `Use PHP ${v}`,
            type: 'radio' as const,
            checked: v === activePhp,
            click: async () => {
              try {
                await getEngine().setDefaultPhpVersion(v);
              } catch {
                // ignore
              }
              await rebuildMenu();
            },
          }))
        : [];

    const template: MenuItemConstructorOptions[] = [
      { label: BRAND.name, enabled: false },
      { label: 'Mail (Mailpit)', click: () => navigateTo('/mailpit') },
      { label: 'Log Viewer', click: () => navigateTo('/logs') },
      { label: 'Services', click: () => navigateTo('/services') },
      { label: 'Sites', click: () => navigateTo('/sites') },
      { type: 'separator' },
      {
        label: `Services (${running}/${services.length} running)`,
        enabled: false,
      },
      {
        label: 'Start all services',
        click: async () => {
          try {
            await getEngine().start();
          } catch {
            // ignore
          }
          await rebuildMenu();
        },
      },
      {
        label: 'Stop all services',
        click: async () => {
          try {
            await getEngine().stop();
          } catch {
            // ignore
          }
          await rebuildMenu();
        },
      },
      ...serviceItems,
      ...(phpItems.length ? [{ type: 'separator' as const }, ...phpItems] : []),
      {
        label: 'Open configuration files',
        click: () => {
          if (dataDir) void shell.openPath(dataDir);
        },
      },
      { type: 'separator' },
      { label: 'Open Stacklet', click: () => showWindow() },
      { label: 'Settings', click: () => navigateTo('/settings') },
      { label: 'Check for updates', click: () => navigateTo('/settings') },
      { label: 'Quit', click: () => app.quit() },
    ];

    tray?.setContextMenu(Menu.buildFromTemplate(template));
  };

  void rebuildMenu();
  // Keep the menu's service status reasonably fresh.
  refreshTimer = setInterval(() => void rebuildMenu(), 5000);

  tray.on('double-click', () => showWindow());
  tray.on('click', () => showWindow());

  return tray;
}

export function destroyTray(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  tray?.destroy();
  tray = null;
}
