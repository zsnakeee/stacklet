import { execFileSync } from 'child_process';
import fs from 'fs';

function runCertutilAddStore(
  certPath: string,
  storeArgs: string[],
): { installed: boolean; certPath: string } {
  try {
    execFileSync('certutil', [...storeArgs, '-f', certPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const out = [
      err && typeof err === 'object' && 'stdout' in err ? String((err as { stdout?: string }).stdout) : '',
      err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr?: string }).stderr) : '',
      err instanceof Error ? err.message : String(err),
    ].join('\n');
    if (/already|exists|duplicate/i.test(out)) {
      return { installed: true, certPath };
    }
    throw new Error(out.trim() || 'certutil failed to add certificate');
  }
  return { installed: true, certPath };
}

/**
 * Install a certificate into the Windows trusted root store.
 * Requires an elevated helper process.
 */
export function installRootCert(certPath: string): { installed: boolean; certPath: string } {
  if (!certPath) {
    throw new Error('cert:install requires args.certPath');
  }
  if (!fs.existsSync(certPath)) {
    throw new Error(`certificate not found: ${certPath}`);
  }

  if (process.env['DEVMGR_MOCK_CERT'] === '1') {
    return { installed: true, certPath };
  }

  if (process.platform !== 'win32') {
    throw new Error('cert:install is Windows-only');
  }

  return runCertutilAddStore(certPath, ['-addstore', 'Root']);
}

/** Current-user Trusted Root — Chrome/Edge often need this even when the machine store has the CA. */
export function installRootCertCurrentUser(certPath: string): { installed: boolean; certPath: string } {
  if (!certPath) {
    throw new Error('cert:install requires args.certPath');
  }
  if (!fs.existsSync(certPath)) {
    throw new Error(`certificate not found: ${certPath}`);
  }
  if (process.env['DEVMGR_MOCK_CERT'] === '1') {
    return { installed: true, certPath };
  }
  if (process.platform !== 'win32') {
    throw new Error('cert:install is Windows-only');
  }
  return runCertutilAddStore(certPath, ['-addstore', '-user', 'Root']);
}
