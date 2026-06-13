import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { downloadFile } from '../bundled/download';
import { extractZipArchive } from '../bundled/extract-zip';
import { getDataDir, getServicesCacheDir } from '../shared/paths';

/**
 * ngrok — public sharing for local sites. Auto-installed into the Stacklet data
 * dir (like Composer) so "Share online" works without the user hand-installing
 * the CLI. The auth token is stored in a Stacklet-owned ngrok.yml so it stays
 * self-contained and doesn't depend on a global ngrok config.
 */
const NGROK_URL = 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip';

export function getNgrokDir(): string {
  return path.join(getDataDir(), 'tools', 'ngrok');
}
export function getNgrokExe(): string {
  return path.join(getNgrokDir(), 'ngrok.exe');
}
/** Stacklet-owned ngrok config (holds the auth token), passed via --config. */
export function getNgrokConfigPath(): string {
  return path.join(getNgrokDir(), 'ngrok.yml');
}

export interface NgrokStatus {
  installed: boolean;
  /** Whether an auth token has been configured (ngrok requires one to connect). */
  authConfigured: boolean;
  dir: string;
  exePath: string;
}

export function getNgrokStatus(): NgrokStatus {
  const installed = fs.existsSync(getNgrokExe());
  let authConfigured = false;
  try {
    const cfg = getNgrokConfigPath();
    if (fs.existsSync(cfg)) {
      authConfigured = /authtoken\s*:/.test(fs.readFileSync(cfg, 'utf8'));
    }
  } catch {
    // ignore — treat as not configured
  }
  return { installed, authConfigured, dir: getNgrokDir(), exePath: getNgrokExe() };
}

/** Download + extract the ngrok CLI into the data dir. Idempotent. */
export async function installNgrok(
  onProgress?: (message: string) => void,
): Promise<NgrokStatus> {
  const dir = getNgrokDir();
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(getServicesCacheDir(), 'ngrok-v3-windows-amd64.zip');

  onProgress?.('Downloading ngrok…');
  await downloadFile(NGROK_URL, zipPath);

  onProgress?.('Extracting ngrok…');
  extractZipArchive(zipPath, dir);

  // The zip is flat (just ngrok.exe), but guard against a nested folder layout.
  if (!fs.existsSync(getNgrokExe())) {
    const found = findExeRecursive(dir, 'ngrok.exe');
    if (found && found !== getNgrokExe()) {
      fs.copyFileSync(found, getNgrokExe());
    }
  }
  if (!fs.existsSync(getNgrokExe())) {
    throw new Error('ngrok.exe not found after extraction.');
  }

  try {
    fs.rmSync(zipPath, { force: true });
  } catch {
    // best-effort cleanup
  }
  onProgress?.('ngrok installed.');
  return getNgrokStatus();
}

/** Make sure ngrok is present, downloading it on first use. Returns the exe path. */
export async function ensureNgrokInstalled(
  onProgress?: (message: string) => void,
): Promise<string> {
  if (!fs.existsSync(getNgrokExe())) {
    await installNgrok(onProgress);
  }
  return getNgrokExe();
}

/** Save an ngrok auth token into the Stacklet-owned config. */
export function setNgrokAuthToken(token: string): NgrokStatus {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Enter your ngrok auth token.');
  if (!fs.existsSync(getNgrokExe())) {
    throw new Error('Install ngrok first, then add your auth token.');
  }
  const result = spawnSync(
    getNgrokExe(),
    ['config', 'add-authtoken', trimmed, '--config', getNgrokConfigPath()],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(
      `Failed to save ngrok auth token: ${(result.stderr || result.stdout || '').trim() || 'unknown error'}`,
    );
  }
  return getNgrokStatus();
}

function findExeRecursive(dir: string, name: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExeRecursive(full, name);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
}
