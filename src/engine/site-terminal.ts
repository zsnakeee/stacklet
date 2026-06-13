import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getDataDir } from '../shared/paths';

const execFileAsync = promisify(execFile);

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'site';
}

/** Write a .bat that cds into a project, prepends PATH dirs, and runs a command. */
function writeCommandLauncher(
  key: string,
  cwd: string,
  pathDirs: string[],
  command: string,
  title: string,
  cmderInit?: string,
): string {
  const dir = path.join(getDataDir(), 'launchers');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sanitize(key)}.bat`);
  const prepend = pathDirs.filter(Boolean).map((p) => path.normalize(p)).join(';');
  // Keep the window open afterward. When Cmder/Clink is enabled, the persistent
  // shell loads vendor\init.bat so it gets rich tab completion + history search
  // (same as `cmd.exe /k vendor\init.bat`); otherwise a plain `cmd /k`.
  const keepOpen =
    cmderInit && fs.existsSync(cmderInit) ? `cmd /k "${cmderInit}"` : 'cmd /k';
  const lines = [
    '@echo off',
    `title ${title}`,
    `cd /d "${cwd}"`,
    prepend ? `set "PATH=${prepend};%PATH%"` : '',
    command,
    'echo.',
    keepOpen,
  ].filter(Boolean);
  fs.writeFileSync(file, lines.join('\r\n'), 'utf8');
  return file;
}

/**
 * Open a new interactive terminal (Windows Terminal if available, else cmd) in
 * `cwd` with `pathDirs` prepended to PATH, running `command`. Used for Tinker
 * and other interactive site commands.
 */
export async function openTerminalCommand(opts: {
  key: string;
  cwd: string;
  pathDirs: string[];
  command: string;
  title: string;
  /** When set (and the file exists), the kept-open shell loads this Cmder/Clink init. */
  cmderInit?: string;
}): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Opening a terminal is only supported on Windows.');
  }
  if (!fs.existsSync(opts.cwd)) {
    throw new Error(`Project folder not found: ${opts.cwd}`);
  }
  const launcher = writeCommandLauncher(
    opts.key,
    opts.cwd,
    opts.pathDirs,
    opts.command,
    opts.title,
    opts.cmderInit,
  );

  try {
    await execFileAsync('where', ['wt.exe'], { windowsHide: true });
    spawn('cmd.exe', ['/c', 'start', '', 'wt.exe', '-w', '0', 'cmd', '/k', launcher], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  } catch {
    // Windows Terminal not installed — fall back to classic console.
  }
  spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', launcher], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}
