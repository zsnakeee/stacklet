/**
 * Privileged helper client — placeholder.
 *
 * This module will provide the main process (engine) with a typed client
 * for communicating with the out-of-process privileged helper over a
 * named pipe (Windows) / XPC socket (macOS).
 *
 * The helper performs only elevated operations:
 *   - Editing the system hosts file
 *   - Binding to low ports (80/443)
 *   - Installing/removing trusted root CA certificates
 *   - Configuring local DNS (Windows: per-adapter, macOS: /etc/resolver)
 *
 * The engine never runs as SYSTEM/root; all privilege is isolated here.
 *
 * This file is a placeholder; implementation begins in Phase 0 spike.
 */

export class HelperClient {
  // TODO: implement IPC transport and method stubs in Phase 0
}
