import { contextBridge, ipcRenderer } from 'electron';

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

export interface DevmgrAPI {
  status: () => Promise<unknown>;
  statusLive: () => Promise<{
    services: unknown[];
    bundledServices: unknown[];
  }>;
  config: () => Promise<unknown>;
  sites: () => Promise<unknown>;
  apply: () => Promise<unknown>;
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
    }>;
    save: (patch: {
      general?: { path_in_env?: boolean; path_env_selected?: string[] };
      services?: Record<string, { enabled?: boolean }>;
    }) => Promise<unknown>;
    openPath: (targetPath: string) => Promise<void>;
  };
}

const devmgrAPI: DevmgrAPI = {
  status: () => ipcRenderer.invoke('devmgr:status'),
  statusLive: () => ipcRenderer.invoke('devmgr:status:live'),
  config: () => ipcRenderer.invoke('devmgr:config'),
  sites: () => ipcRenderer.invoke('devmgr:sites'),
  apply: () => ipcRenderer.invoke('devmgr:apply'),
  hosts: {
    status: () => ipcRenderer.invoke('devmgr:hosts:status'),
    sync: () => ipcRenderer.invoke('devmgr:hosts:sync'),
  },
  start: () => ipcRenderer.invoke('devmgr:start'),
  stop: () => ipcRenderer.invoke('devmgr:stop'),
  park: (directory) => ipcRenderer.invoke('devmgr:park', directory),
  sitesRemove: (name) => ipcRenderer.invoke('devmgr:sites:remove', name),
  dialog: {
    pickDirectory: () => ipcRenderer.invoke('devmgr:dialog:directory'),
  },
  service: {
    start: (name) => ipcRenderer.invoke('devmgr:service:start', name),
    stop: (name) => ipcRenderer.invoke('devmgr:service:stop', name),
  },
  php: {
    versions: () => ipcRenderer.invoke('devmgr:php:versions'),
    defaultVersion: () => ipcRenderer.invoke('devmgr:php:default'),
    setDefault: (version) => ipcRenderer.invoke('devmgr:php:setDefault', version),
    getSettings: (version) => ipcRenderer.invoke('devmgr:php:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('devmgr:php:saveSettings', patch, version),
    openIni: (version) => ipcRenderer.invoke('devmgr:php:openIni', version),
    extensions: (version) => ipcRenderer.invoke('devmgr:php:extensions', version),
    setExtension: (name, enabled, version) =>
      ipcRenderer.invoke('devmgr:php:setExtension', name, enabled, version),
    enableRecommended: (version) =>
      ipcRenderer.invoke('devmgr:php:enableRecommended', version),
    peclInstallable: (version) => ipcRenderer.invoke('devmgr:php:peclInstallable', version),
    installPecl: (peclName, version) =>
      ipcRenderer.invoke('devmgr:php:installPecl', peclName, version),
    restart: () => ipcRenderer.invoke('devmgr:php:restart'),
  },
  mysql: {
    getSettings: (version) => ipcRenderer.invoke('devmgr:mysql:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('devmgr:mysql:saveSettings', patch, version),
    openIni: (version) => ipcRenderer.invoke('devmgr:mysql:openIni', version),
    restart: () => ipcRenderer.invoke('devmgr:mysql:restart'),
  },
  phpmyadmin: {
    getSettings: (version) => ipcRenderer.invoke('devmgr:phpmyadmin:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('devmgr:phpmyadmin:saveSettings', patch, version),
    openConfig: (version) => ipcRenderer.invoke('devmgr:phpmyadmin:openConfig', version),
  },
  nginx: {
    getSettings: (version) => ipcRenderer.invoke('devmgr:nginx:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('devmgr:nginx:saveSettings', patch, version),
    openConf: (version) => ipcRenderer.invoke('devmgr:nginx:openConf', version),
    restart: () => ipcRenderer.invoke('devmgr:nginx:restart'),
  },
  sitesActions: {
    createLaravel: (name) => ipcRenderer.invoke('devmgr:sites:createLaravel', name),
    linkExisting: (sourcePath, projectName) =>
      ipcRenderer.invoke('devmgr:sites:linkExisting', sourcePath, projectName),
    remove: (name) => ipcRenderer.invoke('devmgr:sites:remove', name),
    cloneGit: (url, name) => ipcRenderer.invoke('devmgr:sites:cloneGit', url, name),
    setEnabled: (name, enabled) =>
      ipcRenderer.invoke('devmgr:sites:setEnabled', name, enabled),
    setFavorite: (name, favorite) =>
      ipcRenderer.invoke('devmgr:sites:setFavorite', name, favorite),
    setDomain: (name, domain, aliases) =>
      ipcRenderer.invoke('devmgr:sites:setDomain', name, domain, aliases),
    setReverb: (name, patch) => ipcRenderer.invoke('devmgr:sites:setReverb', name, patch),
  },
  site: {
    detail: (name) => ipcRenderer.invoke('devmgr:sites:detail', name),
    openInExplorer: (name) => ipcRenderer.invoke('devmgr:sites:openInExplorer', name),
    artisan: (name, args) => ipcRenderer.invoke('devmgr:sites:artisan', name, args),
    resolveLog: (name) => ipcRenderer.invoke('devmgr:sites:resolveLog', name),
    reverbStatus: (name) => ipcRenderer.invoke('devmgr:sites:reverbStatus', name),
    applyReverbEnv: (name) => ipcRenderer.invoke('devmgr:sites:applyReverbEnv', name),
    restartReverb: (name) => ipcRenderer.invoke('devmgr:sites:restartReverb', name),
  },
  services: {
    catalog: () => ipcRenderer.invoke('devmgr:services:catalog'),
    refresh: () => ipcRenderer.invoke('devmgr:services:refresh'),
    install: (serviceId, version) =>
      ipcRenderer.invoke('devmgr:services:install', serviceId, version),
    update: (serviceId, version) =>
      ipcRenderer.invoke('devmgr:services:update', serviceId, version),
    uninstall: (serviceId) => ipcRenderer.invoke('devmgr:services:uninstall', serviceId),
    installedVersions: (serviceId) =>
      ipcRenderer.invoke('devmgr:services:installedVersions', serviceId),
    versionInfo: (serviceId, version) =>
      ipcRenderer.invoke('devmgr:services:versionInfo', serviceId, version),
    setActive: (serviceId, version) =>
      ipcRenderer.invoke('devmgr:services:setActive', serviceId, version),
    onInstallProgress: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: InstallProgressPayload) =>
        callback(payload);
      ipcRenderer.on('devmgr:install:progress', handler);
      return () => ipcRenderer.removeListener('devmgr:install:progress', handler);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('devmgr:window:minimize'),
    maximize: () => ipcRenderer.send('devmgr:window:maximize'),
    close: () => ipcRenderer.send('devmgr:window:close'),
    onMaximized: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
      ipcRenderer.on('devmgr:window:maximized', handler);
      return () => ipcRenderer.removeListener('devmgr:window:maximized', handler);
    },
  },
  bootstrap: {
    onPhase: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, phase: BootstrapPhase) => callback(phase);
      ipcRenderer.on('devmgr:bootstrap:phase', handler);
      return () => ipcRenderer.removeListener('devmgr:bootstrap:phase', handler);
    },
    onDone: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload?: { error?: string }) =>
        callback(payload);
      ipcRenderer.on('devmgr:bootstrap:done', handler);
      return () => ipcRenderer.removeListener('devmgr:bootstrap:done', handler);
    },
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('devmgr:shell:openExternal', url),
  },
  ssl: {
    status: () => ipcRenderer.invoke('devmgr:ssl:status'),
    trust: () => ipcRenderer.invoke('devmgr:ssl:trust'),
  },
  env: {
    info: () => ipcRenderer.invoke('devmgr:env:info'),
    sync: () => ipcRenderer.invoke('devmgr:env:sync'),
    restart: (openTerminal) => ipcRenderer.invoke('devmgr:env:restart', openTerminal),
  },
  settings: {
    paths: () => ipcRenderer.invoke('devmgr:settings:paths'),
    save: (patch) => ipcRenderer.invoke('devmgr:settings:save', patch),
    openPath: (targetPath) => ipcRenderer.invoke('devmgr:settings:openPath', targetPath),
  },
  logs: {
    list: () => ipcRenderer.invoke('devmgr:logs:list'),
    tail: (id, lines) => ipcRenderer.invoke('devmgr:logs:tail', id, lines ?? 50),
    resolveForService: (bundledId) =>
      ipcRenderer.invoke('devmgr:logs:resolveForService', bundledId),
    open: (id, label) => ipcRenderer.invoke('devmgr:logs:open', id, label),
    follow: (id) => ipcRenderer.invoke('devmgr:logs:follow', id),
    unfollow: (id) => ipcRenderer.invoke('devmgr:logs:unfollow', id),
    onAppend: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { id: string; chunk: string }) =>
        callback(payload);
      ipcRenderer.on('devmgr:logs:append', handler);
      return () => ipcRenderer.removeListener('devmgr:logs:append', handler);
    },
  },
};

contextBridge.exposeInMainWorld('devmgr', devmgrAPI);
