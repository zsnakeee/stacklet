/**
 * elevate.ts — Launch the privileged helper as an elevated process.
 *
 * Uses a small .cmd launcher + UAC (Start-Process -Verb RunAs) so the helper
 * always runs under real Node, not Electron (unless Node is unavailable).
 */

import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureDir, getDataDir } from '../shared/paths';
import { stopExistingHelper } from './helper-process';
import { probePipe } from './pipe';
import { PIPE_PATH } from './protocol';

const PIPE_READY_TIMEOUT_MS = 30_000;
const PIPE_POLL_INTERVAL_MS = 200;
const POST_UAC_DELAY_MS = 400;

export function getHelperLogPath(): string {
  return path.join(getDataDir(), 'helper.log');
}

export interface HelperRuntime {
  executable: string;
  useElectronRunAsNode: boolean;
}

export function isElevated(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execFileSync('net', ['session'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findNodeOnPath(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('where.exe', ['node'], { encoding: 'utf8' });
    const line = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().endsWith('node.exe'));
    return line && fs.existsSync(line) ? line : null;
  } catch {
    return null;
  }
}

/** Prefer system Node; Electron dev builds fall back to ELECTRON_RUN_AS_NODE. */
export function resolveHelperRuntime(): HelperRuntime {
  const candidates = [
    process.env['npm_node_execpath'],
    process.env['DEVMGR_NODE_PATH'],
    findNodeOnPath(),
    path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'nodejs',
      'node.exe',
    ),
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return { executable: c, useElectronRunAsNode: false };
    }
  }

  if (process.versions.electron && fs.existsSync(process.execPath)) {
    return { executable: process.execPath, useElectronRunAsNode: true };
  }

  if (fs.existsSync(process.execPath)) {
    return { executable: process.execPath, useElectronRunAsNode: false };
  }

  throw new Error(
    'Could not find Node.js to run the privileged helper. Install Node.js or set DEVMGR_NODE_PATH.',
  );
}

async function waitForPipe(timeoutMs: number = PIPE_READY_TIMEOUT_MS): Promise<void> {
  await new Promise((r) => setTimeout(r, POST_UAC_DELAY_MS));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await probePipe(PIPE_PATH);
    if (state === 'ready') return;
    if (state === 'denied') {
      throw new Error(
        'Helper is running but this app cannot access its pipe (EPERM). ' +
          'Click Apply again — dev-mgr will restart the helper with the correct permissions.',
      );
    }
    await new Promise((r) => setTimeout(r, PIPE_POLL_INTERVAL_MS));
  }

  const logPath = getHelperLogPath();
  throw new Error(
    `Helper pipe not ready after ${timeoutMs}ms. ` +
      `Approve the UAC prompt if shown, or check ${logPath} for helper startup errors.`,
  );
}

export function resolveServerPath(): string {
  const alongside = path.join(__dirname, 'server.js');
  if (fs.existsSync(alongside)) return alongside;

  const fromDist = path.resolve(__dirname, '..', '..', 'dist', 'helper', 'server.js');
  if (fs.existsSync(fromDist)) return fromDist;

  throw new Error(
    `Helper server not found (expected ${alongside}). Run: npm run build`,
  );
}

function writeLauncherCmd(
  runtime: HelperRuntime,
  serverPath: string,
): string {
  ensureDir(getDataDir());
  const launcherPath = path.join(getDataDir(), 'launch-helper.cmd');
  const logPath = getHelperLogPath();

  const lines = ['@echo off'];
  if (runtime.useElectronRunAsNode) {
    lines.push('set ELECTRON_RUN_AS_NODE=1');
  }
  lines.push(`"${runtime.executable}" "${serverPath}" 1>>"${logPath}" 2>&1`);
  fs.writeFileSync(launcherPath, lines.join('\r\n') + '\r\n', 'utf8');
  return launcherPath;
}

function spawnHelperDetached(runtime: HelperRuntime, serverPath: string): void {
  const logPath = getHelperLogPath();
  ensureDir(getDataDir());
  const logFd = fs.openSync(logPath, 'a');
  const env = { ...process.env };
  if (runtime.useElectronRunAsNode) {
    env['ELECTRON_RUN_AS_NODE'] = '1';
  }

  const child = spawn(runtime.executable, [serverPath], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    env,
  });
  child.unref();
  fs.closeSync(logFd);
}

export interface ElevateOptions {
  serverPath?: string;
  timeoutMs?: number;
}

let launchInFlight: Promise<void> | null = null;

/** Launch elevated helper once; concurrent callers share the same UAC / spawn. */
export async function launchHelper(options: ElevateOptions = {}): Promise<void> {
  if (launchInFlight) {
    return launchInFlight;
  }
  launchInFlight = launchHelperOnce(options).finally(() => {
    launchInFlight = null;
  });
  return launchInFlight;
}

async function launchHelperOnce(options: ElevateOptions = {}): Promise<void> {
  const serverPath = options.serverPath ?? resolveServerPath();
  const timeoutMs = options.timeoutMs ?? PIPE_READY_TIMEOUT_MS;
  const runtime = resolveHelperRuntime();

  if (process.platform !== 'win32') {
    throw new Error('launchHelper is Windows-only');
  }

  if (!fs.existsSync(serverPath)) {
    throw new Error(`Helper server not found: ${serverPath}`);
  }

  stopExistingHelper();
  await new Promise((r) => setTimeout(r, 300));

  if (isElevated()) {
    console.log('[elevate] process is already elevated; spawning helper directly');
    spawnHelperDetached(runtime, serverPath);
  } else {
    console.log('[elevate] requesting elevation via UAC...');
    const launcherPath = writeLauncherCmd(runtime, serverPath);
    const escapedLauncher = launcherPath.replace(/'/g, "''");

    const psCommand =
      `Start-Process -FilePath '${escapedLauncher}' -Verb RunAs -WindowStyle Hidden`;

    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
      stdio: 'inherit',
    });

    await new Promise<void>((resolve, reject) => {
      ps.on('close', (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `PowerShell exited with code ${code}. The UAC prompt may have been denied.`,
            ),
          );
        }
      });
      ps.on('error', reject);
    });
  }

  console.log('[elevate] waiting for helper pipe...');
  await waitForPipe(timeoutMs);
  console.log('[elevate] helper is ready');
}
