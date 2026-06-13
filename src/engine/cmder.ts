import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { downloadFile } from '../bundled/download';
import { extractZipArchive } from '../bundled/extract-zip';
import { getDataDir, getServicesCacheDir } from '../shared/paths';

/** clink.bat launcher inside the bundled Cmder (picks the right arch). */
export function getClinkBat(): string {
  return path.join(getCmderDir(), 'vendor', 'clink', 'clink.bat');
}

/**
 * Register clink's cmd AutoRun so it loads in EVERY cmd.exe session (Windows
 * Terminal, Run → cmd, etc.), not only Stacklet's launcher. Writes to the
 * per-user AutoRun registry; reversible with `clink autorun uninstall`.
 * Note: clink only works in cmd.exe — PowerShell has its own PSReadLine.
 */
export function registerClinkAutorun(): boolean {
  const clink = getClinkBat();
  if (process.platform !== 'win32' || !fs.existsSync(clink)) return false;
  const res = spawnSync(clink, ['autorun', 'install'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return res.status === 0;
}

/**
 * Cmder (mini) — bundles Clink, which gives the classic cmd.exe rich tab
 * completion, history search, and a nicer prompt. Auto-installed into the data
 * dir so Stacklet's terminals can opt into the same experience as
 * `cmd.exe /k vendor\init.bat` without the user installing anything.
 */
const CMDER_URL =
  'https://github.com/cmderdev/cmder/releases/download/v1.3.25/cmder_mini.zip';

export function getCmderDir(): string {
  return path.join(getDataDir(), 'tools', 'cmder');
}
/** Cmder's init script — loads Clink into the current cmd session. */
export function getCmderInitBat(): string {
  return path.join(getCmderDir(), 'vendor', 'init.bat');
}

export interface CmderStatus {
  installed: boolean;
  dir: string;
  initBat: string;
}

export function getCmderStatus(): CmderStatus {
  return {
    installed: fs.existsSync(getCmderInitBat()),
    dir: getCmderDir(),
    initBat: getCmderInitBat(),
  };
}

/** Download + extract Cmder mini into the data dir. Idempotent. */
export async function installCmder(
  onProgress?: (message: string) => void,
): Promise<CmderStatus> {
  const dir = getCmderDir();
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(getServicesCacheDir(), 'cmder_mini.zip');

  onProgress?.('Downloading Cmder (with Clink)…');
  await downloadFile(CMDER_URL, zipPath);

  onProgress?.('Extracting Cmder…');
  extractZipArchive(zipPath, dir);

  if (!fs.existsSync(getCmderInitBat())) {
    throw new Error('Cmder init script not found after extraction.');
  }
  // Make clink load in every cmd.exe, not just Stacklet's terminal (best-effort).
  onProgress?.('Enabling Clink in all cmd terminals…');
  try {
    registerClinkAutorun();
  } catch {
    // best-effort — Stacklet's own terminals still load clink via init.bat
  }
  try {
    fs.rmSync(zipPath, { force: true });
  } catch {
    // best-effort cleanup
  }
  onProgress?.('Cmder installed.');
  return getCmderStatus();
}

/** Ensure Cmder is present, downloading it on first use. Returns init.bat path. */
export async function ensureCmderInstalled(
  onProgress?: (message: string) => void,
): Promise<string> {
  if (!fs.existsSync(getCmderInitBat())) {
    await installCmder(onProgress);
  }
  return getCmderInitBat();
}
