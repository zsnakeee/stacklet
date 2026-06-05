import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { bootstrapEngineOnLaunch, registerEngineIpc, shutdownEngineOnQuit } from './engine-bridge';
import { createTray, destroyTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let shutdownComplete = false;

function rendererIndexPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'renderer', 'index.html');
  }
  const srcHtml = path.join(app.getAppPath(), 'src', 'renderer', 'index.html');
  if (fs.existsSync(srcHtml)) {
    return srcHtml;
  }
  return path.join(__dirname, '..', 'renderer', 'index.html');
}

function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.on('devmgr:window:minimize', () => {
    getWindow()?.minimize();
  });
  ipcMain.on('devmgr:window:maximize', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('devmgr:window:close', () => {
    getWindow()?.close();
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#090c0e',
    show: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(rendererIndexPath());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.on('maximize', () => {
    win.webContents.send('devmgr:window:maximized', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('devmgr:window:maximized', false);
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    mainWindow = null;
  });
  return win;
}

function getWindow(): BrowserWindow | null {
  return mainWindow;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerEngineIpc(getWindow);
  registerWindowIpc(getWindow);
  mainWindow = createWindow();
  createTray(getWindow);
  // Let the window paint and handle UI IPC before autostart (apply/helper can block).
  mainWindow.webContents.once('did-finish-load', () => {
    void bootstrapEngineOnLaunch(getWindow);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray on Windows
  }
});

app.on('before-quit', (event) => {
  if (shutdownComplete) return;

  event.preventDefault();
  quitting = true;
  destroyTray();

  void shutdownEngineOnQuit()
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[dev-mgr] shutdown:', msg);
    })
    .finally(() => {
      shutdownComplete = true;
      app.quit();
    });
});
