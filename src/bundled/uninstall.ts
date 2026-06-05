import fs from 'fs';
import path from 'path';
import type { BundledServiceId, InstallProgress, InstallProgressHandler } from './types';
import { clearServiceFromConfig } from './sync-config';
import { getInstalledRecord, readManifest, removeInstalled, writeManifest } from './registry';
import { getServicesDir, getServicesCacheDir } from '../shared/paths';
import { loadConfig, saveConfig } from '../config/store';

function emit(handler: InstallProgressHandler | undefined, progress: InstallProgress): void {
  handler?.(progress);
}

export async function uninstallService(
  serviceId: BundledServiceId,
  onProgress?: InstallProgressHandler,
): Promise<void> {
  const record = getInstalledRecord(serviceId);
  if (!record) {
    emit(onProgress, {
      serviceId,
      version: '',
      phase: 'done',
      percent: 100,
      message: 'Not installed',
    });
    return;
  }

  emit(onProgress, {
    serviceId,
    version: record.version,
    phase: 'uninstall',
    percent: 10,
    message: 'Removing files…',
  });

  const serviceRoot = path.join(getServicesDir(), serviceId);
  if (fs.existsSync(serviceRoot)) {
    fs.rmSync(serviceRoot, { recursive: true, force: true });
  }

  const cacheZip = path.join(getServicesCacheDir(), `${serviceId}-${record.version}.zip`);
  if (fs.existsSync(cacheZip)) {
    fs.unlinkSync(cacheZip);
  }

  removeInstalled(serviceId);

  const config = loadConfig();
  saveConfig(clearServiceFromConfig(config, serviceId));

  emit(onProgress, {
    serviceId,
    version: record.version,
    phase: 'done',
    percent: 100,
    message: 'Uninstalled',
  });
}
