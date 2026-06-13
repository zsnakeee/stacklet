import path from 'path';
import { app, Menu, Tray, nativeImage } from 'electron';
import { BRAND } from '../shared/brand';
import { getEngine } from './engine-bridge';

let tray: Tray | null = null;

function trayIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png');
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    // Fallback: transparent pixel if the asset is missing.
    return nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );
  }
  return img.resize({ width: 16, height: 16 });
}

export function createTray(showWindow: () => void): Tray {
  tray = new Tray(trayIcon());
  tray.setToolTip(BRAND.name);

  const rebuildMenu = async (): Promise<void> => {
    const st = await getEngine().status();
    const running = st.services.filter((s) => s.state === 'running').length;

    tray?.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: `${BRAND.name} (${running}/${st.services.length} running)`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Open',
          click: () => showWindow(),
        },
        {
          label: 'Apply config',
          click: async () => {
            await getEngine().apply();
            await rebuildMenu();
          },
        },
        {
          label: 'Start all',
          click: async () => {
            await getEngine().start();
            await rebuildMenu();
          },
        },
        {
          label: 'Stop all',
          click: async () => {
            await getEngine().stop();
            await rebuildMenu();
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            app.quit();
          },
        },
      ]),
    );
  };

  rebuildMenu();
  tray.on('double-click', () => showWindow());
  tray.on('click', () => showWindow());

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
