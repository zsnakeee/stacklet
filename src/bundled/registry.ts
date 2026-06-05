import fs from 'fs';
import path from 'path';
import type { BundledServiceId, InstalledServiceRecord, ServicesManifest } from './types';
import {
  ensureDir,
  getServicesDir,
  getServicesManifestPath,
} from '../shared/paths';

export function readManifest(): ServicesManifest {
  const file = getServicesManifestPath();
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ServicesManifest;
}

export function writeManifest(manifest: ServicesManifest): void {
  ensureDir(getServicesDir());
  fs.writeFileSync(getServicesManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

export function getInstallDir(id: BundledServiceId, version: string): string {
  return path.join(getServicesDir(), id, version);
}

export function getInstalledRecord(id: BundledServiceId): InstalledServiceRecord | null {
  const manifest = readManifest();
  return manifest[id] ?? null;
}

export function isInstalled(id: BundledServiceId): boolean {
  const record = getInstalledRecord(id);
  if (!record) return false;
  return fs.existsSync(record.path);
}

export function setInstalled(
  id: BundledServiceId,
  version: string,
  installPath: string,
): InstalledServiceRecord {
  const manifest = readManifest();
  const record: InstalledServiceRecord = {
    version,
    path: installPath,
    installedAt: new Date().toISOString(),
  };
  manifest[id] = record;
  writeManifest(manifest);
  return record;
}

export function removeInstalled(id: BundledServiceId): void {
  const manifest = readManifest();
  delete manifest[id];
  writeManifest(manifest);
}
