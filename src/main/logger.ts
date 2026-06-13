import fs from 'fs';
import path from 'path';
import { ipcMain, shell } from 'electron';
import { getLogsDir } from '../shared/paths';
import type { RendererErrorReport } from '../shared/ipc';

/**
 * Lightweight append-only file logger for the main process. Captures uncaught
 * errors, unhandled rejections, and anything routed through console.error /
 * console.warn (which is where the engine reports failures) so issues like a
 * failed certutil/hosts/PHP operation are recorded for later diagnosis.
 *
 * Every function here is defensive — logging must never throw or crash the app.
 */

let cachedPath: string | null = null;

export function getAppLogPath(): string | null {
  if (cachedPath) return cachedPath;
  try {
    const dir = getLogsDir();
    fs.mkdirSync(dir, { recursive: true });
    cachedPath = path.join(dir, 'app.log');
    return cachedPath;
  } catch {
    return null;
  }
}

function format(parts: unknown[]): string {
  return parts
    .map((p) => {
      if (p instanceof Error) return p.stack ?? `${p.name}: ${p.message}`;
      if (typeof p === 'string') return p;
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    })
    .join(' ');
}

export function appendLog(level: string, ...parts: unknown[]): void {
  try {
    const file = getAppLogPath();
    if (!file) return;
    const line = `[${new Date().toISOString()}] [${level}] ${format(parts)}\n`;
    fs.appendFileSync(file, line, 'utf8');
  } catch {
    // never throw from the logger
  }
}

let installed = false;

/** Hook global error sources + tee console.error/warn to the log file. */
export function initErrorLogging(): void {
  if (installed) return;
  installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    appendLog('error', ...args);
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    appendLog('warn', ...args);
    origWarn(...args);
  };

  process.on('uncaughtException', (err) => {
    appendLog('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    appendLog('unhandledRejection', reason);
  });

  registerDiagnosticsIpc();

  appendLog('info', `Stacklet main started (pid ${process.pid})`);
}

/** IPC for renderer-side error capture: forward reports to app.log + reveal it. */
function registerDiagnosticsIpc(): void {
  // `send` (fire-and-forget) from the renderer's global error handlers.
  ipcMain.on('stacklet:diagnostics:report', (_e, report: RendererErrorReport) => {
    try {
      const where = report?.url ? ` @ ${report.url}` : '';
      const parts: unknown[] = [`[${report?.source ?? 'renderer'}]${where} ${report?.message ?? ''}`];
      if (report?.stack) parts.push(`\n${report.stack}`);
      if (report?.componentStack) parts.push(`\nComponent stack:${report.componentStack}`);
      appendLog('renderer', ...parts);
    } catch {
      // never throw from the logger
    }
  });

  ipcMain.handle('stacklet:diagnostics:logPath', () => getAppLogPath());

  ipcMain.handle('stacklet:diagnostics:openLog', async () => {
    const file = getAppLogPath();
    if (!file) throw new Error('Log file is not available.');
    // Make sure the file exists so the OS file manager has something to select.
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, '', 'utf8');
      } catch {
        // fall through — showItemInFolder will still open the folder
      }
    }
    shell.showItemInFolder(file);
  });
}
