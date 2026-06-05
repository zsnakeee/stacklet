import { spawnSync } from 'child_process';
import fs from 'fs';
import forge from 'node-forge';
import { getCaCertPath } from '../shared/paths';

const DEVMGR_CA_SUBJECT = 'DevMgr Local CA';

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
  const stdout = store.stdout ?? '';
  const normalized = stdout.toLowerCase().replace(/ /g, '');
  if (normalized.includes(thumb)) return true;
  return stdout.includes(DEVMGR_CA_SUBJECT);
}

/** True when the dev-mgr CA is in a Windows Trusted Root store (machine or current user). */
export function isDevMgrCaTrusted(caCertPath: string = getCaCertPath()): boolean {
  if (process.platform !== 'win32') return false;
  if (!fs.existsSync(caCertPath)) return false;

  const thumb = getCertSha1Thumbprint(caCertPath);
  if (!thumb) return false;

  return (
    isCaInCertStore(['Root'], thumb) ||
    isCaInCertStore(['-user', 'Root'], thumb)
  );
}
