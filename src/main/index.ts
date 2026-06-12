import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'path';
import {
  bootstrapEngineOnLaunch,
  getEngine,
  registerEngineIpc,
  shutdownEngineOnQuit,
} from './engine-bridge';
import { createTray, destroyTray } from './tray';
import { initErrorLogging } from './logger';

initErrorLogging();

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let shutdownComplete = false;

function rendererIndexPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'renderer', 'index.html');
  }
  // Dev (electron . on compiled output): load the Vite build output, NOT the
  // src/renderer/index.html source entry (which is a Vite entry that only works
  // through bundling). __dirname is dist/main, so ../renderer is dist/renderer.
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

function startMinimized(): boolean {
  try {
    return getEngine().getConfig().general.start_minimized === true;
  } catch {
    return false;
  }
}

function startMaximized(): boolean {
  try {
    return getEngine().getConfig().general.start_maximized === true;
  } catch {
    return false;
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#090c0e',
    show: !startMinimized(),
    frame: false,
    autoHideMenuBar: true,
    icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'build', 'icon.png'),
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
  if (startMaximized() && !startMinimized()) {
    win.maximize();
  }
  return win;
}

function getWindow(): BrowserWindow | null {
  return mainWindow;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerEngineIpc(getWindow);
  registerWindowIpc(getWindow);
  try {
    app.setLoginItemSettings({
      openAtLogin: getEngine().getConfig().general.launch_on_login === true,
    });
  } catch {
    // login-item registration is best-effort
  }
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
