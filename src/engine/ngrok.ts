import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { downloadFile } from '../bundled/download';
import { extractZipArchive } from '../bundled/extract-zip';
import { getDataDir, getServicesCacheDir } from '../shared/paths';

/** A system-installed ngrok on PATH (so we can use it instead of downloading). */
function findSystemNgrok(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('where.exe', ['ngrok'], { encoding: 'utf8' });
    const line = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().endsWith('ngrok.exe'));
    return line && fs.existsSync(line) ? line : null;
  } catch {
    return null;
  }
}

/** The ngrok to run: Stacklet's bundled copy if present, else one on PATH. */
export function resolveNgrokExe(): string | null {
  const bundled = getNgrokExe();
  if (fs.existsSync(bundled)) return bundled;
  return findSystemNgrok();
}

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
  const resolved = resolveNgrokExe();
  const installed = resolved !== null;
  let authConfigured = false;
  try {
    const cfg = getNgrokConfigPath();
    if (fs.existsSync(cfg)) {
      authConfigured = /authtoken\s*:/.test(fs.readFileSync(cfg, 'utf8'));
    }
  } catch {
    // ignore — treat as not configured
  }
  return { installed, authConfigured, dir: getNgrokDir(), exePath: resolved ?? getNgrokExe() };
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

  const downloaded = fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0;
  if (downloaded < 1024) {
    throw new Error('ngrok download failed (empty file). Check your internet connection.');
  }

  onProgress?.('Extracting ngrok…');
  extractZipArchive(zipPath, dir);

  // The zip is normally flat (just ngrok.exe); search the tree in case the
  // layout changes, and copy whatever we find to the canonical path.
  if (!fs.existsSync(getNgrokExe())) {
    const found = findExeRecursive(dir, 'ngrok.exe');
    if (found && path.resolve(found) !== path.resolve(getNgrokExe())) {
      fs.copyFileSync(found, getNgrokExe());
    }
  }
  if (!fs.existsSync(getNgrokExe())) {
    const sys = findSystemNgrok();
    if (sys) return getNgrokStatus(); // fall back to PATH ngrok (see resolveNgrokExe)
    throw new Error(
      'Could not extract ngrok.exe. Install ngrok manually from ngrok.com and ensure it is on PATH, then try Share again.',
    );
  }

  try {
    fs.rmSync(zipPath, { force: true });
  } catch {
    // best-effort cleanup
  }
  onProgress?.('ngrok installed.');
  return getNgrokStatus();
}

/**
 * Make sure ngrok is runnable. Prefers an existing copy (bundled or on PATH);
 * only downloads when none is found. Returns the exe path to run.
 */
export async function ensureNgrokInstalled(
  onProgress?: (message: string) => void,
): Promise<string> {
  const existing = resolveNgrokExe();
  if (existing) return existing;
  await installNgrok(onProgress);
  const resolved = resolveNgrokExe();
  if (!resolved) throw new Error('ngrok is not available.');
  return resolved;
}

/** Save an ngrok auth token into the Stacklet-owned config. */
export function setNgrokAuthToken(token: string): NgrokStatus {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Enter your ngrok auth token.');
  const exe = resolveNgrokExe();
  if (!exe) {
    throw new Error('Install ngrok first, then add your auth token.');
  }
  const result = spawnSync(
    exe,
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
