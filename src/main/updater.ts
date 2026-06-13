/**
 * Auto-update via electron-updater + GitHub Releases.
 *
 * The build's `publish` config (package.json → build.publish) points at the
 * GitHub repo; electron-builder emits `latest.yml` + the NSIS installer +
 * `.blockmap` into each release. electron-updater reads `latest.yml` from the
 * newest GitHub Release to detect and download updates.
 *
 * Design notes:
 *   - Manual download by default (autoDownload = false): we surface "an update
 *     is available" and let the user choose to download, rather than pulling a
 *     ~120 MB installer unannounced.
 *   - Fully offline-safe: every entry point is guarded and errors (no network,
 *     no releases yet) are reported as a benign status, never a crash. Stacklet
 *     is designed to run without internet — updates are strictly best-effort.
 *   - Only active in a packaged build; in dev electron-updater has no
 *     `app-update.yml` and would throw, so we no-op.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { logPrefix } from '../shared/brand';
import { getDataDir, setDataDirOverride } from '../shared/paths';

/**
 * Pin the data directory currently in use into the override pointer (which lives
 * OUTSIDE the install dir and data dir) so an update's silent NSIS reinstall
 * can't reset the location — the new build resolves the same paths on relaunch.
 */
function pinDataDirBeforeInstall(): void {
  try {
    setDataDirOverride(getDataDir());
  } catch (err) {
    console.warn(`${logPrefix()} updater: could not pin data dir:`, err);
  }
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available'; version: string }
  | {
      state: 'downloading';
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

let lastStatus: UpdateStatus = { state: 'idle' };
let wired = false;

/** GitHub returns release notes as HTML; render them as readable plain text. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/h\d|\/li|\/div)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\s*h\d[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '') // strip remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&rarr;/g, '→')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function notesToText(notes: unknown): string | undefined {
  if (typeof notes === 'string') return htmlToText(notes);
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (n && typeof n === 'object' && 'note' in n ? String(n.note) : String(n)))
      .map(htmlToText)
      .join('\n\n');
  }
  return undefined;
}

function broadcast(getWindow: () => BrowserWindow | null, status: UpdateStatus): void {
  lastStatus = status;
  getWindow()?.webContents.send('stacklet:update:status', status);
}

/** Wire electron-updater events to the renderer. Safe to call once. */
function wireEvents(getWindow: () => BrowserWindow | null): void {
  if (wired) return;
  wired = true;

  // Manual flow: detect → tell the user → they trigger the download.
  autoUpdater.autoDownload = false;
  // If an update was downloaded, install it on the next quit automatically.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m: unknown) => console.log(`${logPrefix()} updater:`, m),
    warn: (m: unknown) => console.warn(`${logPrefix()} updater:`, m),
    error: (m: unknown) => console.error(`${logPrefix()} updater:`, m),
    debug: () => {},
  } as never;

  autoUpdater.on('checking-for-update', () => broadcast(getWindow, { state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    broadcast(getWindow, {
      state: 'available',
      version: info.version,
      notes: notesToText(info.releaseNotes),
    }),
  );
  autoUpdater.on('update-not-available', (info) =>
    broadcast(getWindow, { state: 'not-available', version: info.version }),
  );
  autoUpdater.on('download-progress', (p) =>
    broadcast(getWindow, {
      state: 'downloading',
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    }),
  );
  autoUpdater.on('update-downloaded', (info) => {
    // Pin now so the location survives whether the user clicks install or the
    // update is applied automatically on the next quit (autoInstallOnAppQuit).
    pinDataDirBeforeInstall();
    broadcast(getWindow, { state: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) =>
    broadcast(getWindow, {
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    }),
  );
}

export function registerUpdaterIpc(getWindow: () => BrowserWindow | null): void {
  wireEvents(getWindow);

  ipcMain.handle('stacklet:update:current', () => ({
    version: app.getVersion(),
    status: lastStatus,
    supported: app.isPackaged,
  }));

  ipcMain.handle('stacklet:update:check', async () => {
    if (!app.isPackaged) {
      const status: UpdateStatus = {
        state: 'error',
        message: 'Updates are only available in the installed app, not in development.',
      };
      broadcast(getWindow, status);
      return status;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      broadcast(getWindow, {
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return lastStatus;
  });

  ipcMain.handle('stacklet:update:download', async () => {
    if (!app.isPackaged) return lastStatus;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      broadcast(getWindow, {
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return lastStatus;
  });

  ipcMain.handle('stacklet:update:install', () => {
    if (!app.isPackaged) return;
    pinDataDirBeforeInstall();
    // Silent install into the SAME directory, then relaunch. isSilent=true runs
    // the NSIS updater with no UI/prompts (it reuses the existing install path);
    // isForceRunAfter=true reopens Stacklet when it finishes.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
}

/**
 * Best-effort check shortly after launch. Never throws; offline or
 * release-less repos simply yield an 'error'/'not-available' status the user
 * can ignore. Does NOT auto-download.
 */
export function checkForUpdatesOnLaunch(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;
  wireEvents(getWindow);
  // Delay so launch + first paint aren't competing with a network round-trip.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn(`${logPrefix()} updater (launch check):`, err?.message ?? err);
    });
  }, 8000);
}
