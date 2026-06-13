import type { DevmgrAPI } from '@shared/ipc';

declare global {
  interface Window {
    devmgr: DevmgrAPI;
  }
}

/** Typed handle to the preload-exposed IPC bridge (see src/main/preload.ts). */
export const devmgr: DevmgrAPI = window.devmgr;
