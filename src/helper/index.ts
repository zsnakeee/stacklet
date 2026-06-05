/**
 * Public API surface for the privileged helper subsystem.
 *
 * Engine code imports from this module; it never imports server.ts directly
 * (the server runs in a separate elevated process).
 */

export { HelperClient } from './client';
export {
  launchHelper,
  isElevated,
  getHelperLogPath,
  resolveHelperRuntime,
  resolveServerPath,
} from './elevate';
export { stopExistingHelper, getHelperPidPath } from './helper-process';
export { listenOnPipe, probePipe } from './pipe';
export { hostsAdd, hostsRemove, hostsFileHasAllEntries, hostsSync } from './hosts';
export { installRootCert } from './cert';
export type { HelperRequest, HelperResponse, AllowedOp } from './protocol';
export { ALLOWED_OPS, HELPER_PROTOCOL_VERSION, PIPE_PATH, getTokenPath } from './protocol';
