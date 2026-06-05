/**
 * Stop dev-mgr processes that lock dist/win-unpacked (app.asar) before pack/dist.
 * Windows only — safe scope: executables under this repo path.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** electron-builder (Go) rejects package.json with a UTF-8 BOM */
function stripBomFromPackageJson() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const buf = fs.readFileSync(pkgPath);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    fs.writeFileSync(pkgPath, buf.subarray(3));
    console.log('[predist] Removed UTF-8 BOM from package.json');
  }
}

stripBomFromPackageJson();

if (process.platform !== 'win32') {
  process.exit(0);
}

const ps = `
$root = '${repoRoot.replace(/'/g, "''")}'
Get-CimInstance Win32_Process |
  Where-Object {
    $_.ExecutablePath -and ($_.ExecutablePath.ToLower().StartsWith($root.ToLower()))
  } |
  ForEach-Object {
    Write-Host "Stopping PID $($_.ProcessId) $($_.Name) $($_.ExecutablePath)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
`;

spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', ps],
  { stdio: 'inherit' },
);

// Brief wait for handles to release
spawnSync('powershell.exe', ['-Command', 'Start-Sleep -Milliseconds 800'], { stdio: 'ignore' });

const releaseUnpacked = path.join(repoRoot, 'release', 'win-unpacked');
const legacyUnpacked = path.join(repoRoot, 'dist', 'win-unpacked');

if (fs.existsSync(releaseUnpacked)) {
  try {
    fs.rmSync(releaseUnpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log('[release-pack-lock] removed release/win-unpacked');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[release-pack-lock] could not remove release/win-unpacked:', msg);
    console.warn('Quit Dev Manager (tray → Quit), then retry npm run pack / npm run dist.');
    process.exit(1);
  }
}

if (fs.existsSync(legacyUnpacked)) {
  try {
    fs.rmSync(legacyUnpacked, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
    console.log('[release-pack-lock] removed legacy dist/win-unpacked');
  } catch {
    console.warn(
      '[release-pack-lock] legacy dist/win-unpacked is locked (safe to ignore). ' +
        'Delete it manually after quitting Dev Manager, or ignore — builds use release/ now.',
    );
  }
}
