import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import forge from 'node-forge';
import { getCaCertPath } from '../shared/paths';

/** SHA1 thumbprint of the X.509 certificate (not the PEM file hash). */
export function getCertSha1Thumbprint(certPath: string): string | null {
  if (!fs.existsSync(certPath)) return null;
  try {
    const pem = fs.readFileSync(certPath, 'utf8');
    const cert = forge.pki.certificateFromPem(pem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha1.create();
    md.update(der);
    return md.digest().toHex().toLowerCase();
  } catch {
    return null;
  }
}

function isCaInCertStore(storeArgs: string[], thumb: string): boolean {
  const store = spawnSync('certutil', ['-store', ...storeArgs], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const normalized = (store.stdout ?? '').toLowerCase().replace(/ /g, '');
  return normalized.includes(thumb);
}

function isCaInCertStoreAsync(storeArgs: string[], thumb: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('certutil', ['-store', ...storeArgs], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve(false));
    child.on('close', () => {
      const normalized = stdout.toLowerCase().replace(/ /g, '');
      resolve(normalized.includes(thumb));
    });
  });
}

/** True when the active local CA is in a Windows Trusted Root store (machine or current user). */
export function isLocalCaTrusted(caCertPath: string = getCaCertPath()): boolean {
  if (process.platform !== 'win32') return false;
  if (!fs.existsSync(caCertPath)) return false;

  const thumb = getCertSha1Thumbprint(caCertPath);
  if (!thumb) return false;

  return (
    isCaInCertStore(['Root'], thumb) ||
    isCaInCertStore(['-user', 'Root'], thumb)
  );
}

/** Non-blocking trust check for status polling (does not freeze the Electron main process). */
export async function isLocalCaTrustedAsync(
  caCertPath: string = getCaCertPath(),
): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  if (!fs.existsSync(caCertPath)) return false;

  const thumb = getCertSha1Thumbprint(caCertPath);
  if (!thumb) return false;

  const [machine, user] = await Promise.all([
    isCaInCertStoreAsync(['Root'], thumb),
    isCaInCertStoreAsync(['-user', 'Root'], thumb),
  ]);
  return machine || user;
}

/** @deprecated Use {@link isLocalCaTrusted}. */
export const isDevMgrCaTrusted = isLocalCaTrusted;
