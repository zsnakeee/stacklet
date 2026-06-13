import fs from 'fs';
import path from 'path';
import { downloadFile } from '../bundled/download';
import { extractZipArchive } from '../bundled/extract-zip';
import { getDataDir, getServicesCacheDir } from '../shared/paths';

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
