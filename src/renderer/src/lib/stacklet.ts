import type { StackletAPI } from '@shared/ipc';
import { BRAND } from '@shared/brand';

declare global {
  interface Window {
    stacklet: StackletAPI;
    /** @deprecated Use `window.stacklet`. */
    devmgr: StackletAPI;
  }
}

function resolveStackletApi(): StackletAPI {
  const api = window[BRAND.windowApi as 'stacklet'] ?? window.devmgr;
  if (!api) {
    throw new Error(
      `${BRAND.name} preload bridge missing — restart the app after npm run build`,
    );
  }
  return api;
}

/** Typed handle to the preload-exposed IPC bridge (see `src/main/preload.ts`). */
export const stacklet: StackletAPI = resolveStackletApi();

/** @deprecated Use {@link stacklet}. */
export const devmgr = stacklet;
