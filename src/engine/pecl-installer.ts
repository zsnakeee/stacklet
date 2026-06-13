import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fetchText } from '../bundled/resolvers/http';
import { downloadFile } from '../bundled/download';
import { ensureDir, getServicesCacheDir } from '../shared/paths';
import { detectPhpBuild, peclVsFallbacks, type PhpBuildInfo } from './php-build';
import {
  enableZendExtensionInIni,
  ensureExtensionDirInIni,
  extensionDllName,
  listPhpExtensions,
  setPhpExtensionEnabled,
  verifyPhpExtensionLoads,
} from './php-extensions';
import { resolvePhpIniPath } from './php-ini';

/**
 * Official Windows PECL artifacts (PHP 8.4/8.5 builds are here).
 * @see https://downloads.php.net/~windows/pecl/releases/redis/6.3.0/php_redis-6.3.0-8.5-nts-vs17-x64.zip
 */
export const PECL_RELEASES_BASES = [
  'https://downloads.php.net/~windows/pecl/releases',
  'https://windows.php.net/downloads/pecl/releases',
] as const;

export interface PeclPackageMeta {
  peclName: string;
  label: string;
  /** php.ini extension name (redis, apcu, …) */
  iniName: string;
  zend?: boolean;
}

/**
 * Popular PECL extensions that publish official Windows DLL builds (the
 * resolver downloads from downloads.php.net / windows.php.net). Not every
 * package ships a build for every PHP version — installs that can't find a
 * matching build fail with a clear message, which is expected.
 */
export const PECL_PACKAGES: PeclPackageMeta[] = [
  { peclName: 'redis', label: 'Redis — key/value cache & store', iniName: 'redis' },
  { peclName: 'xdebug', label: 'Xdebug — step debugger & profiler', iniName: 'xdebug', zend: true },
  { peclName: 'apcu', label: 'APCu — in-memory user cache', iniName: 'apcu' },
  { peclName: 'memcached', label: 'Memcached — memcached client', iniName: 'memcached' },
  { peclName: 'memcache', label: 'Memcache — legacy memcached client', iniName: 'memcache' },
  { peclName: 'imagick', label: 'Imagick — ImageMagick image processing', iniName: 'imagick' },
  { peclName: 'mongodb', label: 'MongoDB — MongoDB driver', iniName: 'mongodb' },
  { peclName: 'igbinary', label: 'Igbinary — compact serializer', iniName: 'igbinary' },
  { peclName: 'msgpack', label: 'MessagePack — binary serializer', iniName: 'msgpack' },
  { peclName: 'amqp', label: 'AMQP — RabbitMQ / AMQP client', iniName: 'amqp' },
  { peclName: 'rdkafka', label: 'rdkafka — Apache Kafka client', iniName: 'rdkafka' },
  { peclName: 'grpc', label: 'gRPC — gRPC transport', iniName: 'grpc' },
  { peclName: 'protobuf', label: 'Protobuf — Protocol Buffers', iniName: 'protobuf' },
  { peclName: 'yaml', label: 'YAML — YAML parser/emitter', iniName: 'yaml' },
  { peclName: 'zstd', label: 'Zstd — Zstandard compression', iniName: 'zstd' },
  { peclName: 'lz4', label: 'LZ4 — fast compression', iniName: 'lz4' },
  { peclName: 'ssh2', label: 'SSH2 — libssh2 bindings', iniName: 'ssh2' },
  { peclName: 'uuid', label: 'UUID — libuuid bindings', iniName: 'uuid' },
  { peclName: 'ds', label: 'Data Structures — efficient collections', iniName: 'ds' },
  { peclName: 'event', label: 'Event — libevent bindings', iniName: 'event' },
  { peclName: 'ev', label: 'Ev — libev event loop', iniName: 'ev' },
  { peclName: 'pcov', label: 'PCOV — fast code coverage', iniName: 'pcov' },
  { peclName: 'uopz', label: 'uopz — runtime hooks (testing)', iniName: 'uopz' },
  { peclName: 'mailparse', label: 'Mailparse — parse MIME mail', iniName: 'mailparse' },
  { peclName: 'oauth', label: 'OAuth — OAuth 1.0 consumer', iniName: 'oauth' },
  { peclName: 'yac', label: 'Yac — lockless shared-memory cache', iniName: 'yac' },
  { peclName: 'swoole', label: 'Swoole — async/coroutine runtime', iniName: 'swoole' },
  { peclName: 'xlswriter', label: 'xlswriter — write Excel files', iniName: 'xlswriter' },
  { peclName: 'sodium', label: 'Sodium — libsodium crypto', iniName: 'sodium' },
  { peclName: 'gmagick', label: 'Gmagick — GraphicsMagick', iniName: 'gmagick' },
  { peclName: 'parallel', label: 'parallel — parallel concurrency', iniName: 'parallel' },
  { peclName: 'opentelemetry', label: 'OpenTelemetry — tracing/metrics', iniName: 'opentelemetry' },
];

export interface PeclInstallableExtension {
  peclName: string;
  label: string;
  iniName: string;
  dllPresent: boolean;
  enabled: boolean;
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function parseApacheDirLinks(html: string): string[] {
  const links: string[] = [];
  const re = /href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (href === '../' || href.startsWith('?')) continue;
    links.push(href);
  }
  return links;
}

function comparePeclVersions(a: string, b: string): number {
  const pa = a.replace(/^[^\d]*/, '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.replace(/^[^\d]*/, '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function phpVersionFromPeclZip(zipName: string, peclName: string): string | null {
  const re = new RegExp(`^php_${peclName}-[\\d.]+-(\\d+\\.\\d+)-`, 'i');
  const m = re.exec(zipName);
  return m ? m[1] : null;
}

function zipMatchesBuild(zipName: string, peclName: string, build: PhpBuildInfo, vs: string): boolean {
  const ts = build.threadSafe ? 'ts' : 'nts';
  const phpVer = phpVersionFromPeclZip(zipName, peclName);
  if (phpVer !== build.majorMinor) return false;
  const re = new RegExp(
    `^php_${peclName}-[\\d.]+-${build.majorMinor.replace('.', '\\.')}-${ts}-${vs}-x64\\.zip$`,
    'i',
  );
  return re.test(zipName);
}

function peclCacheZipPath(peclName: string, build: PhpBuildInfo): string {
  return path.join(
    getServicesCacheDir(),
    `pecl-${peclName}-php${build.version}-${build.variantKey}.zip`,
  );
}

function removePeclDlls(extDir: string, iniName: string): void {
  const prefix = `php_${iniName}`.toLowerCase();
  for (const file of fs.readdirSync(extDir)) {
    if (file.toLowerCase().startsWith(prefix)) {
      fs.unlinkSync(path.join(extDir, file));
    }
  }
}

async function listPeclReleaseVersions(peclName: string, base: string): Promise<string[]> {
  const html = await fetchText(`${base}/${peclName}/`);
  return parseApacheDirLinks(html)
    .map((h) => h.replace(/\/$/, ''))
    .filter((v) => /^\d/.test(v))
    .sort(comparePeclVersions);
}

async function listZipsForVersion(
  peclName: string,
  peclVersion: string,
  base: string,
): Promise<string[]> {
  const html = await fetchText(`${base}/${peclName}/${peclVersion}/`);
  return parseApacheDirLinks(html).filter((h) => h.toLowerCase().endsWith('.zip'));
}

/** Build direct PECL zip URL from package, PECL version, and installed PHP build. */
export function peclZipUrl(
  base: string,
  peclName: string,
  peclVersion: string,
  zipFileName: string,
): string {
  return `${base}/${peclName}/${peclVersion}/${zipFileName}`;
}

export async function resolvePeclZipUrl(
  peclName: string,
  build: PhpBuildInfo,
): Promise<string> {
  const vsList = peclVsFallbacks(build.vs);
  const errors: string[] = [];

  for (const base of PECL_RELEASES_BASES) {
    let versions: string[];
    try {
      versions = await listPeclReleaseVersions(peclName, base);
    } catch (err) {
      errors.push(`${base}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (versions.length === 0) continue;

    for (const peclVersion of versions) {
      let zips: string[];
      try {
        zips = await listZipsForVersion(peclName, peclVersion, base);
      } catch {
        continue;
      }

      for (const vs of vsList) {
        const match = zips.find((z) => zipMatchesBuild(z, peclName, build, vs));
        if (match) {
          return peclZipUrl(base, peclName, peclVersion, match);
        }
      }
    }
  }

  throw new Error(
    `No PECL zip for ${peclName} matching PHP ${build.version} (${build.variantKey}, API ${build.zendModuleApi || 'unknown'}). ` +
      `Expected filename like php_${peclName}-<peclVer>-${build.majorMinor}-nts-vs17-x64.zip. ` +
      (errors.length > 0 ? `Mirrors: ${errors.join('; ')}` : ''),
  );
}

function ensurePhpIni(phpRoot: string): string {
  let iniPath = resolvePhpIniPath(phpRoot);
  if (iniPath) return iniPath;

  const template = [path.join(phpRoot, 'php.ini-development'), path.join(phpRoot, 'php.ini-production')].find(
    exists,
  );
  if (!template) throw new Error('php.ini not found');
  iniPath = path.join(phpRoot, 'php.ini');
  fs.copyFileSync(template, iniPath);
  return iniPath;
}

function copyDllsFromZip(zipPath: string, extDir: string): string[] {
  const tempDir = path.join(extDir, '_pecl_extract');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  const copied: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.toLowerCase().endsWith('.dll')) {
        fs.copyFileSync(full, path.join(extDir, entry.name));
        copied.push(entry.name);
      }
    }
  };
  walk(tempDir);
  fs.rmSync(tempDir, { recursive: true, force: true });
  return copied;
}

export function listPeclInstallable(phpRoot: string): PeclInstallableExtension[] {
  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  const installed = new Set(listPhpExtensions(root).map((e) => e.name));

  return PECL_PACKAGES.map((pkg) => {
    const dll = path.join(extDir, extensionDllName(pkg.iniName));
    const dllPresent = exists(dll);
    return {
      peclName: pkg.peclName,
      label: pkg.label,
      iniName: pkg.iniName,
      dllPresent,
      enabled: dllPresent && installed.has(pkg.iniName)
        ? (listPhpExtensions(root).find((e) => e.name === pkg.iniName)?.enabled ?? false)
        : false,
    };
  });
}

export async function installPeclExtension(phpRoot: string, peclName: string): Promise<string> {
  const pkg = PECL_PACKAGES.find((p) => p.peclName === peclName);
  if (!pkg) throw new Error(`Unknown PECL package: ${peclName}`);

  const root = path.resolve(phpRoot);
  const extDir = path.join(root, 'ext');
  ensureDir(extDir);

  const build = detectPhpBuild(root, { strict: true });
  const dllPath = path.join(extDir, extensionDllName(pkg.iniName));
  let needsDownload = !exists(dllPath);

  if (!needsDownload) {
    try {
      verifyPhpExtensionLoads(root, pkg.iniName);
    } catch {
      needsDownload = true;
    }
  }

  if (needsDownload) {
    removePeclDlls(extDir, pkg.iniName);
    const resolvedUrl = await resolvePeclZipUrl(peclName, build);
    const zipName = path.basename(resolvedUrl);
    const zipPhp = phpVersionFromPeclZip(zipName, peclName);
    if (!zipPhp || zipPhp !== build.majorMinor) {
      throw new Error(
        `PECL zip ${zipName} targets PHP ${zipPhp ?? '?'}, but this install is PHP ${build.version} (API ${build.zendModuleApi}).`,
      );
    }
    if (!zipName.includes(`-${build.majorMinor}-`)) {
      throw new Error(`PECL zip filename must include PHP ${build.majorMinor}: ${zipName}`);
    }

    ensureDir(getServicesCacheDir());
    const cacheZip = peclCacheZipPath(peclName, build);
    if (exists(cacheZip)) fs.unlinkSync(cacheZip);
    await downloadFile(resolvedUrl, cacheZip);

    const copied = copyDllsFromZip(cacheZip, extDir);
    const mainDll = extensionDllName(pkg.iniName);
    if (!copied.some((d) => d.toLowerCase() === mainDll.toLowerCase())) {
      throw new Error(`Downloaded ${peclName} but ${mainDll} was not in the archive`);
    }
  }

  if (pkg.zend) {
    const iniPath = ensurePhpIni(root);
    let content = fs.readFileSync(iniPath, 'utf8');
    content = ensureExtensionDirInIni(content, extDir);
    content = enableZendExtensionInIni(content, extensionDllName(pkg.iniName), extDir);
    fs.writeFileSync(iniPath, content, 'utf8');
  } else {
    setPhpExtensionEnabled(root, pkg.iniName, false, { verify: false });
    setPhpExtensionEnabled(root, pkg.iniName, true);
  }

  return pkg.iniName;
}
