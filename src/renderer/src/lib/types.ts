/**
 * Renderer-side data shapes. The preload bridge types most IPC returns as
 * `unknown`; these interfaces describe what the engine actually sends so the
 * React components can consume it with types. Cast at the IPC boundary.
 */

export interface RuntimeService {
  name: string;
  state: 'running' | 'stopped' | 'not_configured' | string;
  port?: string;
  message?: string;
  pid?: number;
}

export interface VersionOption {
  version: string;
  label: string;
}

export interface BundledService {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  installedVersion?: string;
  versions: VersionOption[];
}

export interface Site {
  name: string;
  hostname: string;
  framework: string;
  doc_root: string;
  enabled?: boolean;
  favorite?: boolean;
}

export interface Status {
  services: RuntimeService[];
  bundledServices: BundledService[];
  sites: Site[];
  warnings?: string[];
  ssl?: { trusted: boolean; caCertPath: string };
  dataDir?: string;
  configPath?: string;
  projectsDir?: string;
  logsDir?: string;
  hostsPath?: string;
}

export interface AppConfig {
  general?: {
    web_server?: string;
    tld?: string;
    path_in_env?: boolean;
    path_env_selected?: string[];
    start_minimized?: boolean;
    close_to_tray?: boolean;
    autostart?: boolean;
    launch_on_login?: boolean;
    xdebug?: boolean;
  };
  services?: Record<string, { enabled?: boolean }>;
}

export interface SiteDetail extends Site {
  root: string;
  url: string;
  envPath?: string;
  laravelLogPath?: string;
  laravelLogId?: string;
  hasArtisan?: boolean;
  aliases?: string[];
  defaultHostname: string;
  php_version?: string;
}

export interface VersionInfo {
  installed: boolean;
  active: boolean;
  version: string;
  path: string;
}

export interface LogSource {
  id: string;
  label: string;
  kind: string;
}

export interface PhpExtension {
  name: string;
  enabled: boolean;
  recommended?: boolean;
}

export interface PeclPackage {
  iniName: string;
  label: string;
  peclName: string;
  dllPresent: boolean;
  enabled: boolean;
}

export interface PeclInfo {
  build?: { version: string; variantKey: string; zendModuleApi?: string };
  packages: PeclPackage[];
}

/** A save-settings response can echo back fresh config/status. */
export interface SaveResult {
  config?: AppConfig;
  status?: Status;
}
