import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { DevConfig } from '../config/types';
import { collectEnvPaths } from './collect-env-paths';
import { getDataDir } from '../shared/paths';

const execFileAsync = promisify(execFile);

const ENV_PATHS_MANIFEST = 'env-paths.json';
const SHELL_LAUNCHER = 'shell.cmd';
const BROADCAST_SCRIPT = 'broadcast-env.ps1';

const BROADCAST_PS1 = `$sig = @'
[DllImport("user32.dll", CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
  IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
  uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
'@
Add-Type -MemberDefinition $sig -Name SendMessageTimeoutNative -Namespace StackletWin32
[void][StackletWin32.SendMessageTimeoutNative]::SendMessageTimeout(
  [IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$null)
`;

export interface EnvSyncResult {
  ok: boolean;
  enabled: boolean;
  paths: string[];
  message: string;
}

export interface EnvRestartResult extends EnvSyncResult {
  broadcast: boolean;
  openedNewTerminal: boolean;
}

function envPathsManifestPath(): string {
  return path.join(getDataDir(), ENV_PATHS_MANIFEST);
}

function shellLauncherPath(): string {
  return path.join(getDataDir(), SHELL_LAUNCHER);
}

function loadManagedPaths(): string[] {
  try {
    const raw = fs.readFileSync(envPathsManifestPath(), 'utf8');
    const parsed = JSON.parse(raw) as { paths?: string[] };
    return Array.isArray(parsed.paths) ? parsed.paths.map((p) => path.normalize(p)) : [];
  } catch {
    return [];
  }
}

function saveManagedPaths(paths: string[]): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.writeFileSync(envPathsManifestPath(), JSON.stringify({ paths }, null, 2), 'utf8');
}

async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout.trim();
}

function splitPath(pathValue: string): string[] {
  return pathValue
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.normalize(p));
}

function joinPath(segments: string[]): string {
  return segments.join(';');
}

async function readUserPath(): Promise<string[]> {
  const raw = await runPowerShell(
    '[Environment]::GetEnvironmentVariable("Path","User")',
  );
  return splitPath(raw ?? '');
}

async function writeUserPath(segments: string[]): Promise<void> {
  const value = joinPath(segments);
  await runPowerShell(
    `[Environment]::SetEnvironmentVariable('Path', ${JSON.stringify(value)}, 'User')`,
  );
}

function broadcastScriptPath(): string {
  return path.join(getDataDir(), BROADCAST_SCRIPT);
}

function ensureBroadcastScript(): string {
  const scriptPath = broadcastScriptPath();
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  if (!fs.existsSync(scriptPath) || fs.readFileSync(scriptPath, 'utf8') !== BROADCAST_PS1) {
    fs.writeFileSync(scriptPath, BROADCAST_PS1, 'utf8');
  }
  return scriptPath;
}

/** Notify Windows that environment variables changed (best-effort). */
export async function broadcastEnvironmentChange(): Promise<void> {
  if (process.platform !== 'win32') return;
  const scriptPath = ensureBroadcastScript();
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { windowsHide: true, maxBuffer: 1024 * 1024 },
  );
}

function writeShellLauncher(paths: string[]): string {
  const launcher = shellLauncherPath();
  const prepend = paths.map((p) => path.normalize(p)).join(';');
  const lines = [
    '@echo off',
    'title dev-mgr environment',
    `set "PATH=${prepend};%PATH%"`,
    'echo dev-mgr PATH active for this terminal.',
    'echo.',
    paths.map((p) => `echo   ${p}`).join('\r\n'),
    'echo.',
    'cmd /k',
  ];
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.writeFileSync(launcher, lines.join('\r\n'), 'utf8');
  return launcher;
}

export async function openFreshTerminal(paths: string[]): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const launcher = writeShellLauncher(paths);

  const tryWt = async (): Promise<boolean> => {
    try {
      await execFileAsync('where', ['wt.exe'], { windowsHide: true });
      spawn('cmd.exe', ['/c', 'start', '', 'wt.exe', '-w', '0', 'cmd', '/k', launcher], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      return true;
    } catch {
      return false;
    }
  };

  if (await tryWt()) return true;

  spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', launcher], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
  return true;
}

export async function syncWindowsUserPath(pathsToAdd: string[]): Promise<EnvSyncResult> {
  if (process.platform !== 'win32') {
    return {
      ok: true,
      enabled: false,
      paths: [],
      message: 'PATH sync is only supported on Windows.',
    };
  }

  const previous = loadManagedPaths();
  let userSegments = await readUserPath();
  userSegments = userSegments.filter((p) => !previous.includes(p));

  const nextPaths = pathsToAdd;
  if (nextPaths.length > 0) {
    const merged = [...nextPaths];
    for (const p of userSegments) {
      if (!merged.includes(p)) merged.push(p);
    }
    userSegments = merged;
  }

  await writeUserPath(userSegments);
  saveManagedPaths(nextPaths);

  writeShellLauncher(nextPaths);

  const enabled = nextPaths.length > 0;
  return {
    ok: true,
    enabled,
    paths: nextPaths,
    message: enabled
      ? `Added ${nextPaths.length} path(s) to your user PATH.`
      : 'Removed dev-mgr paths from your user PATH.',
  };
}

export async function restartWindowsEnvironment(
  config: DevConfig,
  options?: { openTerminal?: boolean },
): Promise<EnvRestartResult> {
  const paths = collectEnvPaths(config);
  const sync = await syncWindowsUserPath(paths);
  let broadcast = false;
  try {
    await broadcastEnvironmentChange();
    broadcast = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[dev-mgr] PATH broadcast skipped:', msg);
  }
  const openTerminal = options?.openTerminal !== false;
  const openedNewTerminal =
    openTerminal && sync.paths.length > 0
      ? await openFreshTerminal(sync.paths)
      : false;

  const extra = openedNewTerminal
    ? ' Opened a new terminal with the updated PATH.'
    : ' Close and reopen existing terminals to pick up PATH changes.';

  return {
    ...sync,
    broadcast,
    openedNewTerminal,
    message: sync.message + extra,
  };
}
