/**
 * Pre-extract electron-builder's `winCodeSign` cache WITHOUT the macOS symlinks.
 *
 * On Windows, electron-builder downloads winCodeSign-2.6.0.7z and unpacks it with
 * 7-Zip in symlink-preserving mode. The archive contains macOS `darwin/.../lib`
 * symlinks (libcrypto/libssl .dylib) — creating a symlink needs the
 * SeCreateSymbolicLink privilege, which a normal (non-elevated, non-Developer-Mode)
 * account lacks, so extraction fails with:
 *   "Cannot create symbolic link : A required privilege is not held by the client"
 * and the whole `npm run dist` aborts.
 *
 * Those darwin files are useless for a Windows build. We extract the archive
 * ourselves into the exact cache folder app-builder expects, excluding `darwin/`,
 * so app-builder sees a ready cache and skips its own (failing) extraction.
 *
 * Best-effort: any failure just logs a hint and exits 0 so the build can still
 * try the normal path (e.g. under Developer Mode / an elevated shell).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = 'winCodeSign-2.6.0';
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`;

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');

function log(msg) {
  console.log(`[prepare-wincodesign] ${msg}`);
}

if (process.platform !== 'win32') {
  log('not Windows — nothing to do.');
  process.exit(0);
}

function cacheBase() {
  if (process.env.ELECTRON_BUILDER_CACHE) {
    return path.resolve(process.env.ELECTRON_BUILDER_CACHE);
  }
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'electron-builder', 'Cache');
}

function resolve7za() {
  const p = path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  if (fs.existsSync(p)) return p;
  throw new Error('7za.exe not found (node_modules/7zip-bin). Run npm install.');
}

function isReady(dir) {
  // A successful extraction leaves the Windows signing tools behind.
  return (
    fs.existsSync(dir) &&
    fs.existsSync(path.join(dir, 'windows-10')) &&
    fs.readdirSync(dir).length > 0
  );
}

async function downloadTo(file) {
  log(`downloading ${VERSION}.7z …`);
  const res = await fetch(URL); // global fetch (Node 18+) follows redirects
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  log(`downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  const winCodeSignDir = path.join(cacheBase(), 'winCodeSign');
  const target = path.join(winCodeSignDir, VERSION);

  if (isReady(target)) {
    log(`cache already prepared at ${target}`);
    return;
  }

  const sevenZa = resolve7za();
  fs.mkdirSync(winCodeSignDir, { recursive: true });
  const archive = path.join(winCodeSignDir, `${VERSION}.download.7z`);

  await downloadTo(archive);

  // Clean any partial dir from a previous failed run, then extract sans darwin.
  fs.rmSync(target, { recursive: true, force: true });
  log('extracting (excluding macOS darwin symlinks) …');
  execFileSync(
    sevenZa,
    ['x', archive, `-o${target}`, '-y', '-xr!darwin'],
    { stdio: 'ignore' },
  );
  fs.rmSync(archive, { force: true });

  if (!isReady(target)) {
    throw new Error('extraction completed but the Windows tools are missing.');
  }
  log(`ready — wrote ${target}`);
}

main().catch((err) => {
  log(`could not pre-stage winCodeSign: ${err.message}`);
  log(
    'Falling back to electron-builder. If `npm run dist` then fails with a ' +
      'symlink-privilege error, enable Windows Developer Mode or run the shell as Administrator.',
  );
  process.exit(0);
});
