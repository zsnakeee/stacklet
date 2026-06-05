import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { readPhpInstallMeta } from '../bundled/php-install-meta';

export interface PhpBuildInfo {
  version: string;
  majorMinor: string;
  /** Zend module API number, e.g. 20250925 for PHP 8.5 */
  zendModuleApi: string;
  threadSafe: boolean;
  arch: 'x64';
  vs: string;
  variantKey: string;
}

const VS_CANDIDATES = ['vs17', 'vs16', 'vc15'] as const;

const ZEND_API_BY_MINOR: Record<string, string> = {
  '8.3': '20230831',
  '8.4': '20240924',
  '8.5': '20250925',
};

function parseVariantKey(
  key: string,
): Pick<PhpBuildInfo, 'threadSafe' | 'arch' | 'vs' | 'variantKey'> | null {
  const m = /^(nts|ts)-(vs\d+|vc\d+)-x64$/i.exec(key);
  if (!m) return null;
  return {
    threadSafe: m[1].toLowerCase() === 'ts',
    arch: 'x64',
    vs: m[2].toLowerCase(),
    variantKey: `${m[1].toLowerCase()}-${m[2].toLowerCase()}-x64`,
  };
}

function majorMinor(version: string): string {
  const parts = version.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

function phpExePath(phpRoot: string): string {
  return path.join(phpRoot, 'php.exe');
}

function runPhp(phpRoot: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const phpExe = phpExePath(phpRoot);
  const r = spawnSync(phpExe, args, {
    encoding: 'utf8',
    windowsHide: true,
    cwd: phpRoot,
    timeout: 15_000,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function parseVersionFromCliBanner(text: string): string | null {
  const m = /PHP\s+(\d+\.\d+(?:\.\d+)?)/i.exec(text);
  return m ? m[1] : null;
}

function detectViaPhpExe(
  phpRoot: string,
): Pick<PhpBuildInfo, 'version' | 'majorMinor' | 'threadSafe' | 'zendModuleApi'> | null {
  if (!fs.existsSync(phpExePath(phpRoot))) return null;

  const script =
    'echo PHP_VERSION,PHP_EOL,(ZEND_THREAD_SAFE?"ts":"nts"),PHP_EOL,ZEND_MODULE_API_NO,PHP_EOL;';

  const r = runPhp(phpRoot, ['-n', '-r', script]);
  if (r.status !== 0) return null;

  const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const version = lines[0];
  const threadSafe = lines[1] === 'ts';
  const zendModuleApi = lines[2] ?? ZEND_API_BY_MINOR[majorMinor(version)] ?? '';
  return { version, majorMinor: majorMinor(version), threadSafe, zendModuleApi };
}

function detectViaPhpVersionFlag(
  phpRoot: string,
): Pick<PhpBuildInfo, 'version' | 'majorMinor' | 'threadSafe' | 'zendModuleApi'> | null {
  if (!fs.existsSync(phpExePath(phpRoot))) return null;

  const r = runPhp(phpRoot, ['-n', '-v']);
  const text = `${r.stdout}\n${r.stderr}`;
  const version = parseVersionFromCliBanner(text);
  if (!version || r.status !== 0) return null;

  const threadSafe = !/\bNTS\b/i.test(text) && /\bTS\b/i.test(text);
  const mm = majorMinor(version);
  return {
    version,
    majorMinor: mm,
    threadSafe,
    zendModuleApi: ZEND_API_BY_MINOR[mm] ?? '',
  };
}

/** e.g. .../services/php/8.5.6 → 8.5.6 */
function detectViaInstallDir(
  phpRoot: string,
): Pick<PhpBuildInfo, 'version' | 'majorMinor' | 'threadSafe' | 'zendModuleApi'> | null {
  const base = path.basename(path.resolve(phpRoot));
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(base)) return null;
  const mm = majorMinor(base);
  return {
    version: base,
    majorMinor: mm,
    threadSafe: false,
    zendModuleApi: ZEND_API_BY_MINOR[mm] ?? '',
  };
}

function detectVsFromPhpInfo(phpRoot: string): string {
  if (!fs.existsSync(phpExePath(phpRoot))) return 'vs17';

  const r = runPhp(phpRoot, ['-n', '-i']);
  const text = `${r.stdout}\n${r.stderr}`;
  if (/vs17/i.test(text)) return 'vs17';
  if (/vs16/i.test(text)) return 'vs16';
  if (/vc15/i.test(text)) return 'vc15';
  return 'vs17';
}

/** Resolve Windows PHP build traits for matching PECL DLLs. */
export function detectPhpBuild(phpRoot: string, options?: { strict?: boolean }): PhpBuildInfo {
  const root = path.resolve(phpRoot);
  const meta = readPhpInstallMeta(root);
  const fromMeta = meta ? parseVariantKey(meta.variantKey) : null;

  const fromExe = detectViaPhpExe(root) ?? detectViaPhpVersionFlag(root);
  const fromDir = detectViaInstallDir(root);

  const version = fromExe?.version ?? fromDir?.version;
  const mm = fromExe?.majorMinor ?? fromDir?.majorMinor;

  if (!version || !mm) {
    if (options?.strict) {
      const phpExe = phpExePath(root);
      const probe = runPhp(root, ['-n', '-v']);
      const detail = [probe.stderr, probe.stdout].filter(Boolean).join('\n').trim();
      throw new Error(
        `Cannot detect PHP version from ${phpExe}.${detail ? `\n${detail}` : ''}`,
      );
    }
  }

  const threadSafe = fromExe?.threadSafe ?? fromMeta?.threadSafe ?? false;
  const vs = detectVsFromPhpInfo(root);
  const ts = threadSafe ? 'ts' : 'nts';
  const resolvedVersion = version ?? '8.3.0';
  const resolvedMinor = mm ?? majorMinor(resolvedVersion);

  return {
    version: resolvedVersion,
    majorMinor: resolvedMinor,
    zendModuleApi:
      fromExe?.zendModuleApi ?? fromDir?.zendModuleApi ?? ZEND_API_BY_MINOR[resolvedMinor] ?? '',
    threadSafe,
    arch: 'x64',
    vs,
    variantKey: `${ts}-${vs}-x64`,
  };
}

/** VS toolchains to try when the primary PECL build is missing (newest first). */
export function peclVsFallbacks(primaryVs: string): string[] {
  return [...new Set([primaryVs, ...VS_CANDIDATES])];
}
