import { contextBridge, ipcRenderer } from 'electron';
import type {
  BootstrapPhase,
  InstallProgressPayload,
  StackletAPI,
  UpdateStatus,
} from '../shared/ipc';

// Must match BRAND.windowApi / BRAND.legacySlug in src/shared/brand.ts.
// Do not import brand here — Electron's sandboxed preload cannot require app modules.
const WINDOW_API = 'stacklet';
const LEGACY_WINDOW_API = 'devmgr';

export type { BootstrapPhase, DevmgrAPI, InstallProgressPayload, StackletAPI } from '../shared/ipc';

const stackletAPI: StackletAPI = {
  status: () => ipcRenderer.invoke('stacklet:status'),
  statusLive: () => ipcRenderer.invoke('stacklet:status:live'),
  config: () => ipcRenderer.invoke('stacklet:config'),
  sites: () => ipcRenderer.invoke('stacklet:sites'),
  apply: () => ipcRenderer.invoke('stacklet:apply'),
  reloadAll: () => ipcRenderer.invoke('stacklet:reloadAll'),
  setWebServer: (server) => ipcRenderer.invoke('stacklet:setWebServer', server),
  setTld: (tld) => ipcRenderer.invoke('stacklet:setTld', tld),
  hosts: {
    status: () => ipcRenderer.invoke('stacklet:hosts:status'),
    sync: () => ipcRenderer.invoke('stacklet:hosts:sync'),
  },
  start: () => ipcRenderer.invoke('stacklet:start'),
  stop: () => ipcRenderer.invoke('stacklet:stop'),
  park: (directory) => ipcRenderer.invoke('stacklet:park', directory),
  sitesRemove: (name) => ipcRenderer.invoke('stacklet:sites:remove', name),
  dialog: {
    pickDirectory: () => ipcRenderer.invoke('stacklet:dialog:directory'),
  },
  service: {
    start: (name) => ipcRenderer.invoke('stacklet:service:start', name),
    stop: (name) => ipcRenderer.invoke('stacklet:service:stop', name),
  },
  php: {
    versions: () => ipcRenderer.invoke('stacklet:php:versions'),
    defaultVersion: () => ipcRenderer.invoke('stacklet:php:default'),
    setDefault: (version) => ipcRenderer.invoke('stacklet:php:setDefault', version),
    getSettings: (version) => ipcRenderer.invoke('stacklet:php:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('stacklet:php:saveSettings', patch, version),
    openIni: (version) => ipcRenderer.invoke('stacklet:php:openIni', version),
    extensions: (version) => ipcRenderer.invoke('stacklet:php:extensions', version),
    setExtension: (name, enabled, version) =>
      ipcRenderer.invoke('stacklet:php:setExtension', name, enabled, version),
    enableRecommended: (version) =>
      ipcRenderer.invoke('stacklet:php:enableRecommended', version),
    peclInstallable: (version) => ipcRenderer.invoke('stacklet:php:peclInstallable', version),
    installPecl: (peclName, version) =>
      ipcRenderer.invoke('stacklet:php:installPecl', peclName, version),
    restart: () => ipcRenderer.invoke('stacklet:php:restart'),
  },
  mysql: {
    getSettings: (version) => ipcRenderer.invoke('stacklet:mysql:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('stacklet:mysql:saveSettings', patch, version),
    openIni: (version) => ipcRenderer.invoke('stacklet:mysql:openIni', version),
    restart: () => ipcRenderer.invoke('stacklet:mysql:restart'),
  },
  phpmyadmin: {
    getSettings: (version) => ipcRenderer.invoke('stacklet:phpmyadmin:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('stacklet:phpmyadmin:saveSettings', patch, version),
    openConfig: (version) => ipcRenderer.invoke('stacklet:phpmyadmin:openConfig', version),
  },
  nginx: {
    getSettings: (version) => ipcRenderer.invoke('stacklet:nginx:settings', version),
    saveSettings: (patch, version) =>
      ipcRenderer.invoke('stacklet:nginx:saveSettings', patch, version),
    openConf: (version) => ipcRenderer.invoke('stacklet:nginx:openConf', version),
    restart: () => ipcRenderer.invoke('stacklet:nginx:restart'),
  },
  sitesActions: {
    createLaravel: (name) => ipcRenderer.invoke('stacklet:sites:createLaravel', name),
    linkExisting: (sourcePath, projectName) =>
      ipcRenderer.invoke('stacklet:sites:linkExisting', sourcePath, projectName),
    remove: (name) => ipcRenderer.invoke('stacklet:sites:remove', name),
    cloneGit: (url, name) => ipcRenderer.invoke('stacklet:sites:cloneGit', url, name),
    setEnabled: (name, enabled) =>
      ipcRenderer.invoke('stacklet:sites:setEnabled', name, enabled),
    setFavorite: (name, favorite) =>
      ipcRenderer.invoke('stacklet:sites:setFavorite', name, favorite),
    setDomain: (name, domain, aliases) =>
      ipcRenderer.invoke('stacklet:sites:setDomain', name, domain, aliases),
    setDocRoot: (name, docRoot) =>
      ipcRenderer.invoke('stacklet:sites:setDocRoot', name, docRoot),
    setRewrite: (name, patch) =>
      ipcRenderer.invoke('stacklet:sites:setRewrite', name, patch),
    openWebConfig: (name) => ipcRenderer.invoke('stacklet:sites:openWebConfig', name),
    setPhpVersion: (name, version) =>
      ipcRenderer.invoke('stacklet:sites:setPhpVersion', name, version),
    setReverb: (name, patch) => ipcRenderer.invoke('stacklet:sites:setReverb', name, patch),
  },
  site: {
    detail: (name) => ipcRenderer.invoke('stacklet:sites:detail', name),
    openInExplorer: (name) => ipcRenderer.invoke('stacklet:sites:openInExplorer', name),
    artisan: (name, args) => ipcRenderer.invoke('stacklet:sites:artisan', name, args),
    resolveLog: (name) => ipcRenderer.invoke('stacklet:sites:resolveLog', name),
    reverbStatus: (name) => ipcRenderer.invoke('stacklet:sites:reverbStatus', name),
    applyReverbEnv: (name) => ipcRenderer.invoke('stacklet:sites:applyReverbEnv', name),
    restartReverb: (name) => ipcRenderer.invoke('stacklet:sites:restartReverb', name),
    tinker: (name) => ipcRenderer.invoke('stacklet:sites:tinker', name),
    terminal: (name) => ipcRenderer.invoke('stacklet:sites:terminal', name),
    share: (name) => ipcRenderer.invoke('stacklet:sites:share', name),
    onCreateProgress: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { name: string; message: string }) =>
        callback(payload);
      ipcRenderer.on('stacklet:sites:createProgress', handler);
      return () => ipcRenderer.removeListener('stacklet:sites:createProgress', handler);
    },
  },
  services: {
    catalog: () => ipcRenderer.invoke('stacklet:services:catalog'),
    refresh: () => ipcRenderer.invoke('stacklet:services:refresh'),
    install: (serviceId, version) =>
      ipcRenderer.invoke('stacklet:services:install', serviceId, version),
    update: (serviceId, version) =>
      ipcRenderer.invoke('stacklet:services:update', serviceId, version),
    uninstall: (serviceId) => ipcRenderer.invoke('stacklet:services:uninstall', serviceId),
    installedVersions: (serviceId) =>
      ipcRenderer.invoke('stacklet:services:installedVersions', serviceId),
    versionInfo: (serviceId, version) =>
      ipcRenderer.invoke('stacklet:services:versionInfo', serviceId, version),
    setActive: (serviceId, version) =>
      ipcRenderer.invoke('stacklet:services:setActive', serviceId, version),
    onInstallProgress: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: InstallProgressPayload) =>
        callback(payload);
      ipcRenderer.on('stacklet:install:progress', handler);
      return () => ipcRenderer.removeListener('stacklet:install:progress', handler);
    },
  },
  window: {
    minimize: () => ipcRenderer.send('stacklet:window:minimize'),
    maximize: () => ipcRenderer.send('stacklet:window:maximize'),
    close: () => ipcRenderer.send('stacklet:window:close'),
    onMaximized: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
      ipcRenderer.on('stacklet:window:maximized', handler);
      return () => ipcRenderer.removeListener('stacklet:window:maximized', handler);
    },
  },
  bootstrap: {
    onPhase: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, phase: BootstrapPhase) => callback(phase);
      ipcRenderer.on('stacklet:bootstrap:phase', handler);
      return () => ipcRenderer.removeListener('stacklet:bootstrap:phase', handler);
    },
    onDone: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload?: { error?: string }) =>
        callback(payload);
      ipcRenderer.on('stacklet:bootstrap:done', handler);
      return () => ipcRenderer.removeListener('stacklet:bootstrap:done', handler);
    },
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('stacklet:shell:openExternal', url),
  },
  diagnostics: {
    report: (error) => ipcRenderer.send('stacklet:diagnostics:report', error),
    openLog: () => ipcRenderer.invoke('stacklet:diagnostics:openLog'),
    logPath: () => ipcRenderer.invoke('stacklet:diagnostics:logPath'),
  },
  composer: {
    status: () => ipcRenderer.invoke('stacklet:composer:status'),
    install: () => ipcRenderer.invoke('stacklet:composer:install'),
  },
  ngrok: {
    status: () => ipcRenderer.invoke('stacklet:ngrok:status'),
    install: () => ipcRenderer.invoke('stacklet:ngrok:install'),
    setAuthToken: (token) => ipcRenderer.invoke('stacklet:ngrok:setAuthToken', token),
    onProgress: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('stacklet:ngrok:progress', handler);
      return () => ipcRenderer.removeListener('stacklet:ngrok:progress', handler);
    },
  },
  cmder: {
    status: () => ipcRenderer.invoke('stacklet:cmder:status'),
    install: () => ipcRenderer.invoke('stacklet:cmder:install'),
    onProgress: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('stacklet:cmder:progress', handler);
      return () => ipcRenderer.removeListener('stacklet:cmder:progress', handler);
    },
  },
  ssl: {
    status: () => ipcRenderer.invoke('stacklet:ssl:status'),
    trust: () => ipcRenderer.invoke('stacklet:ssl:trust'),
  },
  env: {
    info: () => ipcRenderer.invoke('stacklet:env:info'),
    sync: () => ipcRenderer.invoke('stacklet:env:sync'),
    restart: (openTerminal) => ipcRenderer.invoke('stacklet:env:restart', openTerminal),
  },
  settings: {
    paths: () => ipcRenderer.invoke('stacklet:settings:paths'),
    save: (patch) => ipcRenderer.invoke('stacklet:settings:save', patch),
    openPath: (targetPath) => ipcRenderer.invoke('stacklet:settings:openPath', targetPath),
    relocateDataDir: (newDir) =>
      ipcRenderer.invoke('stacklet:settings:relocateDataDir', newDir),
    useExistingDataDir: (dir) =>
      ipcRenderer.invoke('stacklet:settings:useExistingDataDir', dir),
    setProjectsDir: (dir) => ipcRenderer.invoke('stacklet:settings:setProjectsDir', dir),
  },
  update: {
    current: () => ipcRenderer.invoke('stacklet:update:current'),
    check: () => ipcRenderer.invoke('stacklet:update:check'),
    download: () => ipcRenderer.invoke('stacklet:update:download'),
    install: () => ipcRenderer.invoke('stacklet:update:install'),
    onStatus: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
      ipcRenderer.on('stacklet:update:status', handler);
      return () => ipcRenderer.removeListener('stacklet:update:status', handler);
    },
  },
  node: {
    nvmStatus: () => ipcRenderer.invoke('stacklet:node:nvmStatus'),
    nvmInstallSelf: () => ipcRenderer.invoke('stacklet:node:nvmInstallSelf'),
    nvmAvailable: () => ipcRenderer.invoke('stacklet:node:nvmAvailable'),
    nvmInstall: (version) => ipcRenderer.invoke('stacklet:node:nvmInstall', version),
    nvmUse: (version) => ipcRenderer.invoke('stacklet:node:nvmUse', version),
    siteInfo: (name) => ipcRenderer.invoke('stacklet:node:siteInfo', name),
  },
  logs: {
    list: () => ipcRenderer.invoke('stacklet:logs:list'),
    tail: (id, lines) => ipcRenderer.invoke('stacklet:logs:tail', id, lines ?? 50),
    resolveForService: (bundledId) =>
      ipcRenderer.invoke('stacklet:logs:resolveForService', bundledId),
    open: (id, label) => ipcRenderer.invoke('stacklet:logs:open', id, label),
    follow: (id) => ipcRenderer.invoke('stacklet:logs:follow', id),
    unfollow: (id) => ipcRenderer.invoke('stacklet:logs:unfollow', id),
    onAppend: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { id: string; chunk: string }) =>
        callback(payload);
      ipcRenderer.on('stacklet:logs:append', handler);
      return () => ipcRenderer.removeListener('stacklet:logs:append', handler);
    },
  },
};

contextBridge.exposeInMainWorld(WINDOW_API, stackletAPI);
/** @deprecated Pre-rename bridge — same object as `window.stacklet`. */
contextBridge.exposeInMainWorld(LEGACY_WINDOW_API, stackletAPI);
