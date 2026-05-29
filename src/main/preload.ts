import { contextBridge } from 'electron';

/**
 * Phase 0 Preload Script Stub
 *
 * This preload script establishes a secure IPC bridge between the main and renderer processes.
 * In Phase 1, additional devmgr API methods will be exposed here (e.g., startEngine, stopEngine, etc.)
 *
 * Security model:
 * - contextIsolation: true (prevents renderer from accessing Node.js APIs)
 * - nodeIntegration: false (ensures Node.js modules are not available in renderer)
 * - contextBridge: used to safely expose only whitelisted APIs
 */

// Minimal API object placeholder for Phase 1 expansion
const devmgrAPI = {};

// Expose the API object to the renderer process
contextBridge.exposeInMainWorld('devmgr', devmgrAPI);
