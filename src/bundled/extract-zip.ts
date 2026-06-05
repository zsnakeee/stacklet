import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { ensureDir } from '../shared/paths';

function escapePsLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function extractWithTar(zipPath: string, destDir: string): boolean {
  const result = spawnSync('tar', ['-xf', zipPath, '-C', destDir], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0;
}

function extractWithExpandArchive(zipPath: string, destDir: string): boolean {
  const cmd = `Expand-Archive -LiteralPath '${escapePsLiteral(zipPath)}' -DestinationPath '${escapePsLiteral(destDir)}' -Force`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', cmd],
    { encoding: 'utf8', windowsHide: true },
  );
  return result.status === 0;
}

/** Extract zip on Windows without adm-zip chmod bugs (e.g. PostgreSQL pgAdmin paths). */
export function extractZipArchive(zipPath: string, destDir: string): void {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Archive not found: ${zipPath}`);
  }
  ensureDir(destDir);

  if (process.platform === 'win32') {
    if (extractWithTar(zipPath, destDir)) return;
    if (extractWithExpandArchive(zipPath, destDir)) return;
  }

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to extract ${path.basename(zipPath)}. ` +
        `On Windows, ensure tar or PowerShell Expand-Archive is available. ${detail}`,
    );
  }
}
