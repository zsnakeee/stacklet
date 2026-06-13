import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { initConfig, loadConfig } from '../config/store';
import {
  bootstrapEngineOnLaunch,
  getEngine,
  registerEngineIpc,
  shutdownEngineOnQuit,
} from './engine-bridge';
import { createTray, destroyTray } from './tray';
import { getDataDir, migrateLegacyDataDir } from '../shared/paths';
import { BRAND, logPrefix, readEnv } from '../shared/brand';
import { isElevated } from '../helper/elevate';
import { initErrorLogging } from './logger';

app.setName(BRAND.name);
process.title = BRAND.name;

// Require administrator — ALWAYS on Windows. Stacklet edits the Windows hosts
// file, installs trusted CA certs, and manages system services, all of which
// need elevation; running un-elevated leaves it half-broken. So if we're not
// elevated, relaunch ourselves through UAC and exit. Escape hatch for debugging
// only: STACKLET_NO_ADMIN=1. Runs BEFORE the single-instance lock so the
// un-elevated process never holds the lock the elevated one needs.
function relaunchElevated(): void {
  try {
    const exe = process.execPath;
    const args = process.argv.slice(1).map((a) => `'${a.replace(/'/g, "''")}'`);
    const argList = args.length ? ` -ArgumentList ${args.join(',')}` : '';
    // In dev, `electron .` resolves the app relative to the working directory,
    // so the elevated relaunch must start in the app dir (a real folder). Don't
    // set it when packaged — getAppPath() points inside app.asar (not a dir).
    const workdir = app.isPackaged ? '' : app.getAppPath().replace(/'/g, "''");
    const wd = workdir ? ` -WorkingDirectory '${workdir}'` : '';
    const command = `Start-Process -FilePath '${exe.replace(/'/g, "''")}'${argList}${wd} -Verb RunAs`;
    // Run SYNCHRONOUSLY: a detached spawn gets torn down by the immediate
    // app.exit() below before PowerShell can launch the elevated instance, which
    // left the app "not running" at all. spawnSync blocks until PowerShell has
    // started the elevated process (or the UAC prompt is dismissed).
    spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    // If relaunch fails the app simply exits un-elevated below — nothing to do.
  }
}

const requireAdmin = process.platform === 'win32' && readEnv('NO_ADMIN') !== '1';
if (requireAdmin && !isElevated()) {
  relaunchElevated();
  app.exit(0);
}

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

// Disk-cache resilience. Even as a single instance, an ungraceful kill
// (Ctrl+C / "Terminate batch job") leaves Chromium's default cache dir locked,
// so the next launch can't migrate it — that's the
//   "Unable to move the cache: Access is denied" / "Gpu Cache Creation failed"
// spam. Point the HTTP cache at a dedicated, app-owned folder (no in-place
// migration "move" happens when the dir is given explicitly) and turn off the
// GPU shader disk cache (the one failing with -2). These switches must be set
// before `app` is ready, hence at module load.
try {
  const cacheDir = path.join(getDataDir(), 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
} catch {
  // best-effort — fall back to the default cache location
}
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

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
    // Stay hidden until the renderer's first paint is ready, then show — avoids
    // the brief empty/white frame and makes launch feel instant.
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.once('ready-to-show', () => {
    if (!prefs.startMinimized) win.show();
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
