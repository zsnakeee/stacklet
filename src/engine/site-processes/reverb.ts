import fs from 'fs';
import path from 'path';
import type { Site } from '../../config/types';
import { getLogsDir } from '../../shared/paths';
import { resolvePhpBinary } from '../site-commands';

export function detectReverbInstalled(site: Site): boolean {
  const vendor = path.join(site.root, 'vendor', 'laravel', 'reverb');
  if (fs.existsSync(vendor)) return true;

  const composerPath = path.join(site.root, 'composer.json');
  if (!fs.existsSync(composerPath)) return false;

  try {
    const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8')) as {
      require?: Record<string, string>;
      'require-dev'?: Record<string, string>;
    };
    return Boolean(
      composer.require?.['laravel/reverb'] || composer['require-dev']?.['laravel/reverb'],
    );
  } catch {
    return false;
  }
}

export interface ReverbSpawnSpec {
  binary: string;
  args: string[];
  cwd: string;
  stderrLog: string;
}

export function buildReverbSpawn(site: Site, port: number): ReverbSpawnSpec {
  const artisan = path.join(site.root, 'artisan');
  if (!fs.existsSync(artisan)) {
    throw new Error('artisan not found in project root');
  }

  const php = resolvePhpBinary();
  const stderrLog = path.join(getLogsDir(), 'sites', site.name, 'reverb.stderr.log');
  fs.mkdirSync(path.dirname(stderrLog), { recursive: true });

  return {
    binary: php,
    args: ['artisan', 'reverb:start', '--host=127.0.0.1', `--port=${port}`],
    cwd: site.root,
    stderrLog,
  };
}

export function shouldRunReverb(site: Site): boolean {
  return (
    site.framework === 'laravel' &&
    site.enabled !== false &&
    site.reverb?.enabled === true &&
    typeof site.reverb.port === 'number' &&
    detectReverbInstalled(site)
  );
}
