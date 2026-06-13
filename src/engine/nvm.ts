/**
 * nvm-windows integration: detect the CLI, list/install/switch Node versions,
 * and resolve a project's pinned Node from a `.nvmrc` / `.node-version` file.
 *
 * nvm-windows stores each runtime under %NVM_HOME%\v<version>\node.exe and puts
 * the active one on PATH via the %NVM_SYMLINK% junction. We shell out to `nvm`
 * for mutations (install/use) and parse its text output for listings.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

/** Run `nvm <args>`; returns trimmed stdout or null if nvm isn't on PATH. */
async function runNvm(args: string[], timeoutMs = 120_000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('nvm', args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.toString().trim();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: Buffer | string };
    if (e.code === 'ENOENT') return null; // nvm not installed / not on PATH
    // A non-zero exit may still carry useful stdout (e.g. `nvm list` quirks).
    if (e.stdout) return e.stdout.toString().trim();
    throw err;
  }
}

const VERSION_RE = /\b(\d+\.\d+\.\d+)\b/;

export interface NvmStatus {
  installed: boolean;
  version: string | null;
  home: string | null;
  symlink: string | null;
  current: string | null;
  installedVersions: string[];
}

/** Parse `nvm list` output → installed versions + the active one (marked `*`). */
function parseList(output: string): { versions: string[]; current: string | null } {
  const versions: string[] = [];
  let current: string | null = null;
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(VERSION_RE);
    if (!m) continue;
    const v = m[1];
    versions.push(v);
    if (line.trimStart().startsWith('*')) current = v;
  }
  return { versions, current };
}

/** Detect nvm-windows and snapshot installed versions + the active one. */
export async function detectNvm(): Promise<NvmStatus> {
  const version = await runNvm(['version'], 10_000);
  if (version === null) {
    return {
      installed: false,
      version: null,
      home: process.env['NVM_HOME'] ?? null,
      symlink: process.env['NVM_SYMLINK'] ?? null,
      current: null,
      installedVersions: [],
    };
  }
  const listOut = (await runNvm(['list'], 15_000)) ?? '';
  const { versions, current } = parseList(listOut);
  return {
    installed: true,
    version: version.split(/\r?\n/)[0]?.trim() || version,
    home: process.env['NVM_HOME'] ?? null,
    symlink: process.env['NVM_SYMLINK'] ?? null,
    current,
    installedVersions: versions,
  };
}

/** Versions installable from nvm's remote index (`nvm list available`). */
export async function nvmListAvailable(): Promise<string[]> {
  const out = await runNvm(['list', 'available'], 30_000);
  if (!out) return [];
  const seen = new Set<string>();
  const versions: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    // The table prints several version columns per row; collect them all.
    for (const m of line.matchAll(/\b(\d+\.\d+\.\d+)\b/g)) {
      const v = m[1];
      if (!seen.has(v)) {
        seen.add(v);
        versions.push(v);
      }
    }
  }
  return versions;
}

/**
 * Auto-install nvm-windows itself (the tool, not a Node version). Tries winget
 * first — it's bundled on Windows 10 1809+/11, handles the UAC prompt, and sets
 * NVM_HOME / NVM_SYMLINK + PATH for us — then falls back to the official Inno
 * Setup installer from GitHub. Either path needs elevation, so a UAC dialog will
 * appear. The new PATH/env only reaches Stacklet after a restart, so the caller
 * tells the user to reopen the app.
 */
export async function installNvmWindows(): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('Automatic nvm install is only supported on Windows.');
  }
  // Already there? Don't kick off a redundant (elevated) install.
  if ((await runNvm(['version'], 10_000)) !== null) {
    return 'nvm-windows is already installed.';
  }

  // 1) winget (preferred).
  try {
    const { stdout, stderr } = await execFileAsync(
      'winget',
      [
        'install',
        '--id',
        'CoreyButler.NVMforWindows',
        '--exact',
        '--silent',
        '--accept-source-agreements',
        '--accept-package-agreements',
      ],
      { windowsHide: true, timeout: 600_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const out = `${stdout}${stderr}`.trim();
    return out || 'nvm-windows installed via winget. Restart Stacklet to pick it up.';
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: Buffer | string; stderr?: Buffer | string };
    if (e.code !== 'ENOENT') {
      // winget exists but exited non-zero (e.g. user declined UAC, or it's
      // already installed under a different source). Surface its own message.
      const out = [String(e.stdout ?? ''), String(e.stderr ?? '')].join('\n').trim();
      if (out) return out;
    }
    // 2) Fall back to the GitHub Inno Setup installer.
    return installNvmFromGithub();
  }
}

/** Download coreybutler's nvm-setup.exe and run it elevated + silently. */
async function installNvmFromGithub(): Promise<string> {
  const url = 'https://github.com/coreybutler/nvm-windows/releases/latest/download/nvm-setup.exe';
  const dest = path.join(os.tmpdir(), 'stacklet-nvm-setup.exe');
  // -Verb RunAs triggers the UAC elevation prompt; Inno Setup's /SILENT runs it
  // without its wizard. -Wait blocks until the installer finishes.
  const script = [
    "$ErrorActionPreference='Stop';",
    `Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile '${dest}';`,
    `Start-Process -FilePath '${dest}' -ArgumentList '/SILENT','/NORESTART','/SP-' -Verb RunAs -Wait;`,
  ].join(' ');
  await execFileAsync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 600_000, maxBuffer: 8 * 1024 * 1024 },
  );
  return 'nvm-windows installed from GitHub. Restart Stacklet to pick it up.';
}

/** Install a Node version via nvm. Returns the command output. */
export async function nvmInstall(version: string): Promise<string> {
  const v = version.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+){0,2}$|^(latest|lts)$/i.test(v)) {
    throw new Error(`Invalid Node version: ${version}`);
  }
  const out = await runNvm(['install', v], 300_000);
  if (out === null) throw new Error('nvm is not installed or not on PATH.');
  return out;
}

/**
 * Switch the globally-active Node via nvm. On nvm-windows this rewrites the
 * %NVM_SYMLINK% junction, which usually requires the app to be elevated — the
 * output is surfaced so the caller can show any permission error.
 */
export async function nvmUse(version: string): Promise<string> {
  const v = version.trim().replace(/^v/i, '');
  const out = await runNvm(['use', v], 60_000);
  if (out === null) throw new Error('nvm is not installed or not on PATH.');
  return out;
}

/** Read a project's pinned Node version from `.nvmrc` or `.node-version`. */
export function readNvmrc(dir: string): string | null {
  for (const file of ['.nvmrc', '.node-version']) {
    try {
      const p = path.join(dir, file);
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8').trim();
      if (raw) return raw.replace(/^v/i, '');
    } catch {
      // unreadable — try the next candidate
    }
  }
  return null;
}

/**
 * Pick the installed version that best satisfies a `.nvmrc` spec.
 * Exact match wins; otherwise the highest version sharing the requested prefix
 * (so "18" resolves to the newest installed 18.x.y).
 */
export function bestInstalledMatch(spec: string, installed: string[]): string | null {
  const want = spec.trim().replace(/^v/i, '');
  if (!want || installed.length === 0) return null;
  if (installed.includes(want)) return want;
  const prefix = want.endsWith('.') ? want : `${want}.`;
  const matches = installed
    .filter((v) => v === want || v.startsWith(prefix))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return matches[0] ?? null;
}

/** Absolute path to a version's runtime folder under NVM_HOME (holds node.exe). */
export function nvmVersionDir(version: string, home: string | null): string | null {
  if (!home) return null;
  for (const name of [`v${version}`, version]) {
    const dir = path.join(home, name);
    if (fs.existsSync(path.join(dir, 'node.exe'))) return dir;
  }
  return null;
}

export interface ResolvedNode {
  dir: string | null;
  version: string | null;
  source: 'nvmrc' | 'bundled' | null;
}

/**
 * Resolve the Node bin dir for a site's terminal: a `.nvmrc`-pinned nvm version
 * when present and installed, else the bundled Node fallback.
 */
export async function resolveSiteNodeBin(
  siteRoot: string,
  fallbackBinDir?: string | null,
): Promise<ResolvedNode> {
  const spec = readNvmrc(siteRoot);
  if (spec) {
    const status = await detectNvm();
    if (status.installed) {
      const match = bestInstalledMatch(spec, status.installedVersions);
      const dir = match ? nvmVersionDir(match, status.home) : null;
      if (dir) return { dir, version: match, source: 'nvmrc' };
    }
  }
  const fallback = fallbackBinDir?.trim();
  if (fallback && fs.existsSync(fallback)) {
    return { dir: fallback, version: null, source: 'bundled' };
  }
  return { dir: null, version: spec, source: null };
}
