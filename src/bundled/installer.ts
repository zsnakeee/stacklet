import fs from 'fs';
import path from 'path';
import { resolveVersionEntry } from './catalog';
import { extractZipArchive } from './extract-zip';
import { downloadFile } from './download';
import { getInstallDir, getInstalledRecord, setInstalled } from './registry';
import type {
  BundledServiceId,
  InstallProgress,
  InstallProgressHandler,
} from './types';
import { configureNginxInstall } from './nginx-paths';
import { ensureCaBundle } from '../engine/php-ca-bundle';
import { ensurePhpIni } from './php-configure';
import { ensurePhpMyAdminConfig } from './phpmyadmin-configure';
import { parsePhpVariantFromZipUrl, writePhpInstallMeta } from './php-install-meta';
import { ensureRedisConfig } from './redis-configure';
import { ensureDir, getServicesCacheDir } from '../shared/paths';

function emit(handler: InstallProgressHandler | undefined, progress: InstallProgress): void {
  handler?.(progress);
}

function findExtractedRoot(extractDir: string, hint?: string): string {
  if (hint) {
    const hinted = path.join(extractDir, hint);
    if (fs.existsSync(hinted)) return hinted;
  }

  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) {
    return path.join(extractDir, dirs[0].name);
  }
  return extractDir;
}

async function mockInstall(
  serviceId: BundledServiceId,
  version: string,
  onProgress?: InstallProgressHandler,
): Promise<string> {
  const installDir = getInstallDir(serviceId, version);
  ensureDir(installDir);

  emit(onProgress, {
    serviceId,
    version,
    phase: 'download',
    percent: 30,
    message: 'Creating mock install…',
  });

  const stubs: Record<BundledServiceId, () => void> = {
    nginx: () => {
      ensureDir(path.join(installDir, 'conf'));
      ensureDir(path.join(installDir, 'logs'));
      fs.writeFileSync(path.join(installDir, 'nginx.exe'), '', 'utf8');
      fs.writeFileSync(
        path.join(installDir, 'conf', 'nginx.conf'),
        'worker_processes 1;\nevents { worker_connections 1024; }\nhttp { include mime.types; }\n',
        'utf8',
      );
      configureNginxInstall(installDir);
    },
    php: () => {
      fs.writeFileSync(path.join(installDir, 'php.exe'), '', 'utf8');
      fs.writeFileSync(path.join(installDir, 'php-cgi.exe'), '', 'utf8');
    },
    mysql: () => {
      ensureDir(path.join(installDir, 'bin'));
      ensureDir(path.join(installDir, 'data'));
      fs.writeFileSync(path.join(installDir, 'bin', 'mysqld.exe'), '', 'utf8');
    },
    postgres: () => {
      ensureDir(path.join(installDir, 'bin'));
      fs.writeFileSync(path.join(installDir, 'bin', 'pg_ctl.exe'), '', 'utf8');
    },
    nodejs: () => {
      fs.writeFileSync(path.join(installDir, 'node.exe'), '', 'utf8');
    },
    redis: () => {
      fs.writeFileSync(path.join(installDir, 'redis-server.exe'), '', 'utf8');
      ensureRedisConfig(installDir, 6379);
    },
    phpmyadmin: () => {
      fs.writeFileSync(path.join(installDir, 'index.php'), '', 'utf8');
    },
    mailpit: () => {
      fs.writeFileSync(path.join(installDir, 'mailpit.exe'), '', 'utf8');
    },
    mongodb: () => {
      ensureDir(path.join(installDir, 'bin'));
      ensureDir(path.join(installDir, 'data'));
      fs.writeFileSync(path.join(installDir, 'bin', 'mongod.exe'), '', 'utf8');
    },
    python: () => {
      fs.writeFileSync(path.join(installDir, 'python.exe'), '', 'utf8');
    },
  };

  stubs[serviceId]();

  return installDir;
}

export async function installService(
  serviceId: BundledServiceId,
  version: string,
  onProgress?: InstallProgressHandler,
): Promise<string> {
  const installDir = getInstallDir(serviceId, version);

  const existing = getInstalledRecord(serviceId);
  if (existing?.version === version && fs.existsSync(existing.path)) {
    emit(onProgress, {
      serviceId,
      version,
      phase: 'done',
      percent: 100,
      message: 'Already installed',
    });
    return existing.path;
  }

  // Additional versions install side-by-side; do not remove other version folders.

  if (process.env['DEVMGR_MOCK_INSTALL'] === '1') {
    const root = await mockInstall(serviceId, version, onProgress);
    setInstalled(serviceId, version, root);
    emit(onProgress, {
      serviceId,
      version,
      phase: 'done',
      percent: 100,
      message: 'Installed',
    });
    return root;
  }

  const ver = await resolveVersionEntry(serviceId, version);

  if (process.platform !== 'win32') {
    throw new Error('Bundled service installs are Windows-only');
  }

  ensureDir(getServicesCacheDir());
  const zipPath = path.join(getServicesCacheDir(), `${serviceId}-${version}.zip`);

  emit(onProgress, {
    serviceId,
    version,
    phase: 'download',
    percent: 0,
    message: `Downloading ${ver.label}…`,
  });

  await downloadFile(ver.url, zipPath, (loaded, total) => {
    const expected = total ?? ver.sizeBytes;
    const pct = Math.min(70, Math.round((loaded / expected) * 70));
    emit(onProgress, {
      serviceId,
      version,
      phase: 'download',
      percent: pct,
      message: `Downloading… ${formatBytes(loaded)}${total ? ` / ${formatBytes(total)}` : ''}`,
    });
  });

  emit(onProgress, {
    serviceId,
    version,
    phase: 'extract',
    percent: 72,
    message: 'Extracting archive…',
  });

  if (fs.existsSync(installDir)) {
    fs.rmSync(installDir, { recursive: true, force: true });
  }
  ensureDir(installDir);

  const extractTemp = path.join(installDir, '_extract');
  extractZipArchive(zipPath, extractTemp);

  const root = findExtractedRoot(extractTemp, ver.rootFolder);
  for (const entry of fs.readdirSync(root)) {
    fs.renameSync(path.join(root, entry), path.join(installDir, entry));
  }
  fs.rmSync(extractTemp, { recursive: true, force: true });

  emit(onProgress, {
    serviceId,
    version,
    phase: 'configure',
    percent: 92,
    message: 'Configuring…',
  });

  if (serviceId === 'mysql' || serviceId === 'postgres') {
    ensureDir(path.join(installDir, 'data'));
  }

  if (serviceId === 'nginx') {
    configureNginxInstall(installDir);
  }

  if (serviceId === 'php') {
    const caBundlePath = await ensureCaBundle();
    ensurePhpIni(installDir, { caBundlePath });
    const variant = parsePhpVariantFromZipUrl(ver.url);
    if (variant) writePhpInstallMeta(installDir, variant);
  }

  if (serviceId === 'phpmyadmin') {
    ensurePhpMyAdminConfig(installDir);
  }

  if (serviceId === 'redis') {
    ensureRedisConfig(installDir, 6379);
  }

  setInstalled(serviceId, version, installDir);

  emit(onProgress, {
    serviceId,
    version,
    phase: 'done',
    percent: 100,
    message: 'Installed successfully',
  });

  return installDir;
}

export async function updateService(
  serviceId: BundledServiceId,
  version: string,
  onProgress?: InstallProgressHandler,
): Promise<string> {
  const existing = getInstalledRecord(serviceId);
  if (!existing) {
    return installService(serviceId, version, onProgress);
  }
  if (existing.version === version) {
    emit(onProgress, {
      serviceId,
      version,
      phase: 'done',
      percent: 100,
      message: 'Already on this version',
    });
    return existing.path;
  }
  return installService(serviceId, version, onProgress);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
