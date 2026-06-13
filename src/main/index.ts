import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'path';
import { initConfig, loadConfig } from '../config/store';
import {
  bootstrapEngineOnLaunch,
  getEngine,
  registerEngineIpc,
  shutdownEngineOnQuit,
} from './engine-bridge';
import { createTray, destroyTray } from './tray';
import { migrateLegacyDataDir } from '../shared/paths';
import { BRAND, logPrefix } from '../shared/brand';
import { initErrorLogging } from './logger';

app.setName(BRAND.name);
process.title = BRAND.name;

// Single-instance guard. Stacklet keeps running in the tray after its window is
// closed (see the window 'close' handler below), so launching it again — every
// `npm start`, or clicking the icon twice — would otherwise spawn a SECOND
// Electron process that fights the resident one over the shared GPU/HTTP disk
// cache. That collision is exactly the log spam:
//   "Unable to move the cache: Access is denied. (0x5)"
//   "Unable to create cache" / "Gpu Cache Creation failed: -2"
// Hand off to the already-running instance and exit immediately instead.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  // app.exit (not app.quit) skips the before-quit engine-shutdown path below,
  // which must not run here — this process never bootstrapped the engine.
  app.exit(0);
}

// Migrate the legacy %LOCALAPPDATA%\devmgr folder to \stacklet before anything
// creates the new data dir.
migrateLegacyDataDir();
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
  ipcMain.on('stacklet:window:minimize', () => {
    getWindow()?.minimize();
  });
  ipcMain.on('stacklet:window:maximize', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('stacklet:window:close', () => {
    getWindow()?.close();
  });
}

function readGeneralPrefs(): {
  startMinimized: boolean;
  startMaximized: boolean;
  launchOnLogin: boolean;
} {
  try {
    const general = loadConfig().general;
    return {
      startMinimized: general.start_minimized === true,
      startMaximized: general.start_maximized === true,
      launchOnLogin: general.launch_on_login === true,
    };
  } catch {
    return { startMinimized: false, startMaximized: false, launchOnLogin: false };
  }
}

function createWindow(prefs: ReturnType<typeof readGeneralPrefs>): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#090c0e',
    show: !prefs.startMinimized,
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
    win.webContents.send('stacklet:window:maximized', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('stacklet:window:maximized', false);
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
  if (prefs.startMaximized && !prefs.startMinimized) {
    win.maximize();
  }
  return win;
}

function getWindow(): BrowserWindow | null {
  return mainWindow;
}

// A second launch was blocked by the single-instance lock above. Bring the
// already-running window to the front instead of doing nothing (the user clicked
// the icon expecting Stacklet to appear).
app.on('second-instance', () => {
  const win = getWindow();
  if (!win) return;
  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  if (!isPrimaryInstance) return;
  Menu.setApplicationMenu(null);
  initConfig();
  const prefs = readGeneralPrefs();
  registerEngineIpc(getWindow);
  registerWindowIpc(getWindow);
  try {
    app.setLoginItemSettings({ openAtLogin: prefs.launchOnLogin });
  } catch {
    // login-item registration is best-effort
  }
  mainWindow = createWindow(prefs);
  createTray(getWindow);
  // Paint the window first; engine init + autostart can block the main thread.
  mainWindow.webContents.once('did-finish-load', () => {
    void bootstrapEngineOnLaunch(getWindow);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(readGeneralPrefs());
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
      console.error(`${logPrefix()} shutdown:`, msg);
    })
    .finally(() => {
      shutdownComplete = true;
      app.quit();
    });
});
