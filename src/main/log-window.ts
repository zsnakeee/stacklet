import { app, BrowserWindow } from 'electron';
import path from 'path';

const logWindows = new Map<string, BrowserWindow>();

function logHtmlPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'renderer', 'log.html');
  }
  return path.join(__dirname, '..', 'renderer', 'log.html');
}

export function openLogWindow(logId: string, label: string): void {
  const existing = logWindows.get(logId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 900,
    height: 560,
    backgroundColor: '#090c0e',
    title: label || 'Log',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  logWindows.set(logId, win);
  win.on('closed', () => logWindows.delete(logId));
  void win.loadFile(logHtmlPath(), { query: { id: logId, label } });
}
