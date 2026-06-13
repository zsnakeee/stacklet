/**
 * Shared IPC contract for the renderer <-> main API bridge.
 *
 * `src/main/preload.ts` exposes `window[BRAND.windowApi]`. Keep this file free
 * of Electron imports so both Node and the browser can reference it.
 */

export interface InstallProgressPayload {
  serviceId: string;
  version: string;
  phase: string;
  percent: number;
  message: string;
}

export type BootstrapPhase =
  | 'config'
  | 'listed'
  | { kind: 'starting'; service: string }
  | { kind: 'started'; service: string }
  | 'finishing'
  | 'ready';

/** An error captured in the renderer and forwarded to the main-process log file. */
export interface RendererErrorReport {
  /** Where it came from: a thrown error, a rejected promise, console.error, or React. */
  source: 'window.onerror' | 'unhandledrejection' | 'console.error' | 'react';
  message: string;
  stack?: string;
  /** Originating URL/route (window.location.hash) for context. */
  url?: string;
  /** React component stack, when source === 'react'. */
  componentStack?: string;
}

/** ngrok install + auth status (auto-installed into the data dir). */
export interface NgrokInfo {
  installed: boolean;
  authConfigured: boolean;
  dir: string;
  exePath: string;
}

/** Cmder (Clink) install status (auto-installed into the data dir). */
export interface CmderInfo {
  installed: boolean;
  dir: string;
  initBat: string;
}

export interface StackletAPI {
  status: () => Promise<unknown>;
  statusLive: () => Promise<{
    services: unknown[];
    bundledServices: unknown[];
  }>;
  config: () => Promise<unknown>;
  sites: () => Promise<unknown>;
  apply: () => Promise<unknown>;
  setWebServer: (server: 'nginx' | 'apache') => Promise<unknown>;
  setTld: (tld: string) => Promise<unknown>;
  reloadAll: () => Promise<unknown>;
  hosts: {
    status: () => Promise<{ hostnames: string[]; complete: boolean; missing: string[] }>;
    sync: () => Promise<{
      updated: boolean;
      skipped: boolean;
      missing: string[];
      status: unknown;
    }>;
  };
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  park: (directory: string) => Promise<unknown>;
  sitesRemove: (name: string) => Promise<unknown>;
  dialog: {
    pickDirectory: () => Promise<string | null>;
    pickFile: (opts?: { name?: string; extensions?: string[] }) => Promise<string | null>;
  };
  service: {
    start: (name: string) => Promise<unknown>;
    stop: (name: string) => Promise<unknown>;
  };
  php: {
    versions: () => Promise<string[]>;
    defaultVersion: () => Promise<string>;
    setDefault: (version: string) => Promise<unknown>;
    getSettings: (version?: string) => Promise<unknown>;
    saveSettings: (patch: Record<string, string>, version?: string) => Promise<unknown>;
    openIni: (version?: string) => Promise<void>;
    extensions: (version?: string) => Promise<unknown>;
    setExtension: (name: string, enabled: boolean, version?: string) => Promise<unknown>;
    enableRecommended: (version?: string) => Promise<unknown>;
    peclInstallable: (version?: string) => Promise<unknown>;
    installPecl: (peclName: string, version?: string) => Promise<unknown>;
    restart: () => Promise<unknown>;
  };
  mysql: {
    getSettings: (version?: string) => Promise<unknown>;
    saveSettings: (
      patch: Record<string, string | number | boolean>,
      version?: string,
    ) => Promise<unknown>;
    openIni: (version?: string) => Promise<void>;
    restart: () => Promise<unknown>;
  };
  phpmyadmin: {
    getSettings: (version?: string) => Promise<unknown>;
    saveSettings: (
      patch: Record<string, string | number | boolean>,
      version?: string,
    ) => Promise<unknown>;
    openConfig: (version?: string) => Promise<void>;
  };
  nginx: {
    getSettings: (version?: string) => Promise<unknown>;
    saveSettings: (
      patch: Record<string, string | number | boolean>,
      version?: string,
    ) => Promise<unknown>;
    openConf: (version?: string) => Promise<void>;
    restart: () => Promise<unknown>;
  };
  redis: {
    getSettings: () => Promise<{
      port: number;
      password: string;
      maxmemory: string;
      maxmemoryPolicy: string;
      appendonly: boolean;
      configPath: string;
      aclSupported: boolean;
    }>;
    saveSettings: (patch: {
      port?: number;
      password?: string;
      maxmemory?: string;
      maxmemoryPolicy?: string;
      appendonly?: boolean;
    }) => Promise<unknown>;
    openConf: () => Promise<void>;
    restart: () => Promise<unknown>;
  };
  services: {
    catalog: () => Promise<unknown>;
    refresh: () => Promise<unknown>;
    install: (serviceId: string, version: string) => Promise<unknown>;
    update: (serviceId: string, version: string) => Promise<unknown>;
    uninstall: (serviceId: string) => Promise<unknown>;
    installedVersions: (serviceId: string) => Promise<string[]>;
    versionInfo: (serviceId: string, version: string) => Promise<unknown>;
    setActive: (serviceId: string, version: string) => Promise<unknown>;
    onInstallProgress: (callback: (p: InstallProgressPayload) => void) => () => void;
  };
  sitesActions: {
    createLaravel: (name: string) => Promise<unknown>;
    linkExisting: (sourcePath: string, projectName?: string) => Promise<unknown>;
    remove: (name: string) => Promise<unknown>;
    cloneGit: (url: string, name?: string) => Promise<unknown>;
    setEnabled: (name: string, enabled: boolean) => Promise<unknown>;
    setFavorite: (name: string, favorite: boolean) => Promise<unknown>;
    setDomain: (name: string, domain: string | null, aliases: string[]) => Promise<unknown>;
    setDocRoot: (name: string, docRoot: string | null) => Promise<unknown>;
    setRewrite: (
      name: string,
      patch: { rewrite?: 'laravel' | 'wordpress' | 'static' | 'spa'; nginx_extra?: string },
    ) => Promise<unknown>;
    openWebConfig: (name: string) => Promise<{ path: string }>;
    setPhpVersion: (name: string, version: string | null) => Promise<unknown>;
    setReverb: (
      name: string,
      patch: { enabled?: boolean; port?: number | null },
    ) => Promise<unknown>;
  };
  site: {
    detail: (name: string) => Promise<unknown>;
    openInExplorer: (name: string) => Promise<void>;
    artisan: (name: string, args: string[]) => Promise<string>;
    resolveLog: (name: string) => Promise<string | null>;
    reverbStatus: (name: string) => Promise<unknown>;
    applyReverbEnv: (name: string) => Promise<unknown>;
    restartReverb: (name: string) => Promise<unknown>;
    tinker: (name: string) => Promise<void>;
    terminal: (name: string) => Promise<void>;
    share: (name: string) => Promise<void>;
    onCreateProgress: (
      callback: (payload: { name: string; message: string }) => void,
    ) => () => void;
  };
  node: {
    nvmStatus: () => Promise<{
      installed: boolean;
      version: string | null;
      home: string | null;
      symlink: string | null;
      current: string | null;
      installedVersions: string[];
    }>;
    nvmInstallSelf: () => Promise<{ ok: boolean; output: string }>;
    nvmAvailable: () => Promise<string[]>;
    nvmInstall: (version: string) => Promise<{ ok: boolean; output: string }>;
    nvmUse: (version: string) => Promise<{ ok: boolean; output: string }>;
    siteInfo: (name: string) => Promise<{
      nvmrc: string | null;
      resolved: {
        dir: string | null;
        version: string | null;
        source: 'nvmrc' | 'bundled' | null;
      };
    }>;
  };
  logs: {
    list: () => Promise<{ id: string; label: string; kind: string }[]>;
    tail: (id: string, lines?: number) => Promise<string[]>;
    resolveForService: (bundledId: string) => Promise<string | null>;
    open: (id: string, label: string) => Promise<void>;
    follow: (id: string) => Promise<void>;
    unfollow: (id: string) => Promise<void>;
    onAppend: (callback: (payload: { id: string; chunk: string }) => void) => () => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    onMaximized: (callback: (maximized: boolean) => void) => () => void;
  };
  bootstrap: {
    onPhase: (callback: (phase: BootstrapPhase) => void) => () => void;
    onDone: (callback: (payload?: { error?: string }) => void) => () => void;
  };
  env: {
    info: () => Promise<{
      candidates: { id: string; label: string; path: string; service: string }[];
      selected: string[];
      paths: string[];
    }>;
    sync: () => Promise<{ ok: boolean; enabled: boolean; paths: string[]; message: string }>;
    restart: (openTerminal?: boolean) => Promise<{
      ok: boolean;
      enabled: boolean;
      paths: string[];
      message: string;
      broadcast: boolean;
      openedNewTerminal: boolean;
    }>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  diagnostics: {
    /** Forward a renderer-side error to the main-process app.log file. */
    report: (error: RendererErrorReport) => void;
    /** Reveal the app.log error file in the OS file manager. */
    openLog: () => Promise<void>;
    /** Absolute path to the app.log file (null if it can't be resolved). */
    logPath: () => Promise<string | null>;
  };
  composer: {
    status: () => Promise<{ installed: boolean; dir: string; pharPath: string }>;
    install: () => Promise<{ installed: boolean; dir: string; pharPath: string }>;
  };
  ngrok: {
    status: () => Promise<NgrokInfo>;
    install: () => Promise<NgrokInfo>;
    setAuthToken: (token: string) => Promise<NgrokInfo>;
    setPath: (exePath: string) => Promise<NgrokInfo>;
    onProgress: (callback: (message: string) => void) => () => void;
  };
  cmder: {
    status: () => Promise<CmderInfo>;
    install: () => Promise<CmderInfo>;
    onProgress: (callback: (message: string) => void) => () => void;
  };
  ssl: {
    status: () => Promise<{ trusted: boolean; caCertPath: string }>;
    trust: () => Promise<{ ok: boolean; message: string }>;
  };
  settings: {
    paths: () => Promise<{
      dataDir: string;
      configPath: string;
      projectsDir: string;
      logsDir: string;
      hostsPath: string;
    }>;
    save: (patch: {
      general?: {
        path_in_env?: boolean;
        path_env_selected?: string[];
        start_minimized?: boolean;
        close_to_tray?: boolean;
        autostart?: boolean;
        launch_on_login?: boolean;
        xdebug?: boolean;
        enhanced_terminal?: boolean;
        default_site?: string;
      };
      services?: Record<string, { enabled?: boolean }>;
    }) => Promise<unknown>;
    openPath: (targetPath: string) => Promise<void>;
    relocateDataDir: (
      newDir: string,
    ) => Promise<{ ok: boolean; message: string; path: string }>;
    /** Point Stacklet at an existing data folder from a previous install (no move). */
    useExistingDataDir: (
      dir: string,
    ) => Promise<{ ok: boolean; message: string; path: string }>;
    setProjectsDir: (dir: string | null) => Promise<unknown>;
  };
  update: {
    /** Current app version + last known update status (supported=false in dev). */
    current: () => Promise<{ version: string; status: UpdateStatus; supported: boolean }>;
    /** Ask GitHub whether a newer release exists. */
    check: () => Promise<UpdateStatus>;
    /** Download the available update (installer + blockmap delta). */
    download: () => Promise<UpdateStatus>;
    /** Quit and install a downloaded update, then relaunch. */
    install: () => void;
    /** Subscribe to update status pushes; returns an unsubscribe fn. */
    onStatus: (callback: (status: UpdateStatus) => void) => () => void;
  };
}

/** Auto-update lifecycle status pushed from the main process. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available'; version: string }
  | {
      state: 'downloading';
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

/** @deprecated Use {@link StackletAPI}. */
export type DevmgrAPI = StackletAPI;
