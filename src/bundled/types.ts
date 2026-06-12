export type BundledServiceId =
  | 'nginx'
  | 'php'
  | 'mysql'
  | 'postgres'
  | 'nodejs'
  | 'redis'
  | 'phpmyadmin'
  | 'mailpit'
  | 'mongodb'
  | 'python';

export type InstallPhase =
  | 'download'
  | 'extract'
  | 'configure'
  | 'uninstall'
  | 'done'
  | 'error';

export interface InstallProgress {
  serviceId: BundledServiceId;
  version: string;
  phase: InstallPhase;
  percent: number;
  message: string;
}

export type InstallProgressHandler = (progress: InstallProgress) => void;

export interface ServiceVersionEntry {
  version: string;
  label: string;
  url: string;
  sizeBytes: number;
  rootFolder?: string;
}

export interface ServiceCatalogEntry {
  id: BundledServiceId;
  name: string;
  description: string;
  versions: ServiceVersionEntry[];
}

export interface InstalledServiceRecord {
  version: string;
  path: string;
  installedAt: string;
}

export interface ServicesManifest {
  nginx?: InstalledServiceRecord;
  php?: InstalledServiceRecord;
  mysql?: InstalledServiceRecord;
  postgres?: InstalledServiceRecord;
  nodejs?: InstalledServiceRecord;
  redis?: InstalledServiceRecord;
  phpmyadmin?: InstalledServiceRecord;
  mailpit?: InstalledServiceRecord;
  mongodb?: InstalledServiceRecord;
  python?: InstalledServiceRecord;
}

export interface BundledServiceStatus {
  id: BundledServiceId;
  name: string;
  description: string;
  installed: boolean;
  installedVersion: string | null;
  installPath: string | null;
  hasUpdate: boolean;
  latestVersion: string | null;
  runtimeState: 'running' | 'stopped' | 'error' | 'n/a';
  runtimeMessage?: string;
  pid?: number;
  versions: ServiceVersionEntry[];
}
