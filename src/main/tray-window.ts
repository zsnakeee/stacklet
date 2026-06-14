import { app, BrowserWindow, screen } from 'electron';
import path from 'path';

/**
 * Frameless popover shown from the tray (Herd-style): a small always-on-top
 * window positioned next to the tray icon, hidden on blur. Renders the dedicated
 * tray.html entry.
 */
let popover: BrowserWindow | null = null;
let lastHidden = 0;

function trayHtmlPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'renderer', 'tray.html');
  }
  return path.join(__dirname, '..', 'renderer', 'tray.html');
}

export function createTrayPopover(): BrowserWindow {
  popover = new BrowserWindow({
    width: 340,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  void popover.loadFile(trayHtmlPath());
  popover.on('blur', () => {
    if (popover && !popover.isDestroyed()) {
      popover.hide();
      lastHidden = Date.now();
    }
  });
  return popover;
}

/** Show the popover anchored to the tray icon bounds (or toggle it off). */
export function toggleTrayPopover(bounds: Electron.Rectangle): void {
  if (!popover || popover.isDestroyed()) return;
  if (popover.isVisible()) {
    popover.hide();
    return;
  }
  // Ignore the click that immediately follows a blur-hide (tray re-click).
  if (Date.now() - lastHidden < 250) return;

  const { width, height } = popover.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const area = display.workArea;

  let x = Math.round(bounds.x + bounds.width / 2 - width / 2);
  // Taskbar usually at the bottom: place the popover above the tray icon.
  let y = Math.round(bounds.y - height - 8);
  if (y < area.y) y = Math.round(bounds.y + bounds.height + 8); // taskbar on top
  x = Math.min(Math.max(x, area.x + 8), area.x + area.width - width - 8);
  y = Math.min(Math.max(y, area.y + 8), area.y + area.height - height - 8);

  popover.setPosition(x, y, false);
  popover.show();
  popover.focus();
}

export function hideTrayPopover(): void {
  if (popover && !popover.isDestroyed() && popover.isVisible()) {
    popover.hide();
    lastHidden = Date.now();
  }
}

export function destroyTrayPopover(): void {
  if (popover && !popover.isDestroyed()) popover.destroy();
  popover = null;
}
