import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getActivePhpVersion, getPhpInstallPath } from '../bundled/installed-versions';
import type { Site } from '../config/types';
import { findLaravelLogPaths, siteHostnameFromDirName } from './sites';

function exists(p: string): boolean {
  return fs.existsSync(p);
}

export function findSiteByName(sites: Site[], name: string): Site | null {
  return sites.find((s) => s.name === name) ?? null;
}

/** Log source id used by LogService for the primary Laravel log file. */
export function resolveLaravelLogId(site: Site): string | null {
  const paths = findLaravelLogPaths(site);
  if (paths.length === 0) return null;
  const logPath =
    paths.find((p) => path.basename(p).toLowerCase() === 'laravel.log') ?? paths[0];
  return `laravel:${site.name}:${path.basename(logPath)}`;
}

export function getSiteDetail(site: Site) {
  const laravelLogs = findLaravelLogPaths(site);
  return {
    ...site,
    url: `https://${site.hostname}`,
    defaultHostname: siteHostnameFromDirName(site.name),
    laravelLogId: site.framework === 'laravel' ? resolveLaravelLogId(site) : null,
    laravelLogPath: laravelLogs[0] ?? null,
    hasArtisan: exists(path.join(site.root, 'artisan')),
    envPath: exists(path.join(site.root, '.env')) ? path.join(site.root, '.env') : null,
  };
}

export function resolvePhpBinary(): string {
  const version = getActivePhpVersion();
  if (!version) {
    throw new Error('No active PHP version. Install PHP and set a default version.');
  }
  const root = getPhpInstallPath(version);
  if (!root) throw new Error(`PHP ${version} is not installed`);
  const php = path.join(root, 'php.exe');
  if (!exists(php)) throw new Error(`PHP binary not found: ${php}`);
  return php;
}

export function runLaravelArtisan(site: Site, args: string[]): Promise<string> {
  if (site.framework !== 'laravel') {
    throw new Error('Not a Laravel project');
  }
  const artisan = path.join(site.root, 'artisan');
  if (!exists(artisan)) {
    throw new Error('artisan not found in project root');
  }

  const php = resolvePhpBinary();

  return new Promise((resolve, reject) => {
    const child = spawn(php, [artisan, ...args], {
      cwd: site.root,
      windowsHide: true,
      env: { ...process.env, CI: '1' },
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout?.on('data', (d) => chunks.push(d));
    child.stderr?.on('data', (d) => errChunks.push(d));

    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(chunks).toString('utf8').trim();
      const err = Buffer.concat(errChunks).toString('utf8').trim();
      const combined = [out, err].filter(Boolean).join('\n');
      const cmd = `artisan ${args.join(' ')}`.trim();
      if (code !== 0) {
        reject(
          new Error(
            combined || `${cmd} exited with code ${code ?? 'unknown'} (no output — try Open terminal to debug).`,
          ),
        );
        return;
      }
      resolve(combined || `${cmd} completed (no output).`);
    });
  });
}
