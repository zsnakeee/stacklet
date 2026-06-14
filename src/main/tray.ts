import path from 'path';
import { app, Menu, Tray, nativeImage } from 'electron';
import { BRAND } from '../shared/brand';

let tray: Tray | null = null;

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

/**
 * Tray icon. Left-click opens the Herd-style popover (a rich frameless window,
 * see tray-window.ts); right-click shows a minimal native fallback menu.
 */
export function createTray(
  showWindow: () => void,
  navigateTo: (route: string) => void,
  togglePopover: (bounds: Electron.Rectangle) => void,
): Tray {
  tray = new Tray(trayIcon());
  tray.setToolTip(BRAND.name);

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Stacklet', click: () => showWindow() },
      { label: 'Settings', click: () => navigateTo('/settings') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );

  tray.on('click', (_e, bounds) => togglePopover(bounds));
  tray.on('double-click', () => showWindow());

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
