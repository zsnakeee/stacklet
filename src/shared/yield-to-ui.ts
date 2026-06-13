/** Yield so Electron can process window IPC, paint, and input between heavy steps. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
