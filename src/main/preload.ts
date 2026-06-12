import { contextBridge, ipcRenderer } from 'electron';
import type { BootstrapPhase, DevmgrAPI, InstallProgressPayload } from '../shared/ipc';

export type { BootstrapPhase, DevmgrAPI, InstallProgressPayload } from '../shared/ipc';

const devmgrAPI: DevmgrAPI = {
  status: () => ipcRenderer.invoke('devmgr:status'),
  statusLive: () => ipcRenderer.invoke('devmgr:status:live'),
  config: () => ipcRenderer.invoke('devmgr:config'),
  sites: () => ipcRenderer.invoke('devmgr:sites'),
  apply: () => ipcRenderer.invoke('devmgr:apply'),
  reloadAll: () => ipcRenderer.invoke('devmgr:reloadAll'),
  setWebServer: (server) => ipcRenderer.invoke('devmgr:setWebServer', server),
  setTld: (tld) => ipcRenderer.invoke('devmgr:setTld', tld),
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
    setDocRoot: (name, docRoot) =>
      ipcRenderer.invoke('devmgr:sites:setDocRoot', name, docRoot),
    setPhpVersion: (name, version) =>
      ipcRenderer.invoke('devmgr:sites:setPhpVersion', name, version),
  },
  site: {
    detail: (name) => ipcRenderer.invoke('devmgr:sites:detail', name),
    openInExplorer: (name) => ipcRenderer.invoke('devmgr:sites:openInExplorer', name),
    artisan: (name, args) => ipcRenderer.invoke('devmgr:sites:artisan', name, args),
    resolveLog: (name) => ipcRenderer.invoke('devmgr:sites:resolveLog', name),
    tinker: (name) => ipcRenderer.invoke('devmgr:sites:tinker', name),
    terminal: (name) => ipcRenderer.invoke('devmgr:sites:terminal', name),
    share: (name) => ipcRenderer.invoke('devmgr:sites:share', name),
    onCreateProgress: (callback) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { name: string; message: string }) =>
        callback(payload);
      ipcRenderer.on('devmgr:sites:createProgress', handler);
      return () => ipcRenderer.removeListener('devmgr:sites:createProgress', handler);
    },
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
  composer: {
    status: () => ipcRenderer.invoke('devmgr:composer:status'),
    install: () => ipcRenderer.invoke('devmgr:composer:install'),
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
