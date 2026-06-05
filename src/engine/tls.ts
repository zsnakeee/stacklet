import fs from 'fs';
import path from 'path';
import forge from 'node-forge';
import type { DevConfig, Site } from '../config/types';
import {
  ensureDir,
  getCaCertPath,
  getCaKeyPath,
  getCertsDir,
  getFullChainCertPath,
  getLeafCertPath,
  getLeafKeyPath,
} from '../shared/paths';

export interface DevCerts {
  caCertPath: string;
  caKeyPath: string;
  leafCertPath: string;
  leafKeyPath: string;
  fullChainCertPath: string;
}

function getSanManifestPath(): string {
  return path.join(getCertsDir(), 'leaf-sans.json');
}

function sanListsEqual(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  if (sa.length !== sb.length) return false;
  return sa.every((v, i) => v === sb[i]);
}

/** CN for the shared leaf — not tied to any site (browsers match hostnames via SAN). */
export const DEV_MGR_LEAF_CN = 'dev-mgr.local';

/** DNS names for the leaf cert. Firefox requires explicit names (not only *.test) on the .test TLD. */
export function collectTlsSanNames(config: DevConfig, sites: Site[]): string[] {
  const names = new Set<string>(['*.test', 'test', DEV_MGR_LEAF_CN]);
  for (const site of sites) {
    if (site.enabled === false) continue;
    if (site.hostname) names.add(site.hostname.trim().toLowerCase());
    for (const alias of site.aliases ?? []) {
      const h = alias.trim().toLowerCase();
      if (h) names.add(h);
    }
  }
  const pma = config.services.phpmyadmin;
  if (pma.enabled && pma.hostname) {
    names.add(pma.hostname.trim().toLowerCase());
  }
  return [...names].sort();
}

function readSanManifest(): string[] | null {
  const manifestPath = getSanManifestPath();
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { names?: string[] };
    return Array.isArray(data.names) ? data.names.sort() : null;
  } catch {
    return null;
  }
}

function writeSanManifest(names: string[]): void {
  fs.writeFileSync(
    getSanManifestPath(),
    JSON.stringify({ names: [...names].sort() }, null, 2),
    'utf8',
  );
}

function writePemPair(
  certPath: string,
  keyPath: string,
  certPem: string,
  keyPem: string,
): void {
  fs.writeFileSync(certPath, certPem, 'utf8');
  fs.writeFileSync(keyPath, keyPem, { encoding: 'utf8', mode: 0o600 });
}

function certsExist(): boolean {
  return (
    fs.existsSync(getCaCertPath()) &&
    fs.existsSync(getCaKeyPath()) &&
    fs.existsSync(getLeafCertPath()) &&
    fs.existsSync(getLeafKeyPath())
  );
}

function createCa(): { cert: forge.pki.Certificate; keys: forge.pki.rsa.KeyPair } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [{ name: 'commonName', value: 'DevMgr Local CA' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      digitalSignature: true,
    },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert, keys };
}

function leafCommonName(): string {
  return DEV_MGR_LEAF_CN;
}

function createLeaf(
  caCert: forge.pki.Certificate,
  caPrivateKey: forge.pki.rsa.PrivateKey,
  sanNames: string[],
): { cert: forge.pki.Certificate; keys: forge.pki.rsa.KeyPair } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Date.now());
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

  const cn = leafCommonName();
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: sanNames.map((value) => ({
        type: 2,
        value,
      })),
    },
  ]);
  cert.sign(caPrivateKey, forge.md.sha256.create());
  return { cert, keys };
}

function loadCaFromDisk(): { cert: forge.pki.Certificate; privateKey: forge.pki.rsa.PrivateKey } {
  const cert = forge.pki.certificateFromPem(fs.readFileSync(getCaCertPath(), 'utf8'));
  const privateKey = forge.pki.privateKeyFromPem(
    fs.readFileSync(getCaKeyPath(), 'utf8'),
  ) as forge.pki.rsa.PrivateKey;
  return { cert, privateKey };
}

function writeLeaf(sanNames: string[]): void {
  const ca = loadCaFromDisk();
  const leaf = createLeaf(ca.cert, ca.privateKey, sanNames);
  writePemPair(
    getLeafCertPath(),
    getLeafKeyPath(),
    forge.pki.certificateToPem(leaf.cert),
    forge.pki.privateKeyToPem(leaf.keys.privateKey),
  );
  writeSanManifest(sanNames);
}

function leafNeedsRegeneration(requiredSans: string[]): boolean {
  if (!certsExist()) return true;
  const manifest = readSanManifest();
  if (!manifest) return true;
  return !sanListsEqual(manifest, requiredSans);
}

/**
 * Generate (or reuse) a local CA and a leaf certificate covering all site hostnames.
 * Regenerates the leaf when sites/phpMyAdmin hostnames change.
 */
export function ensureDevCerts(sanNames?: string[]): DevCerts {
  const requiredSans = sanNames ?? ['*.test', 'test'];
  const certsDir = getCertsDir();
  ensureDir(certsDir);

  const paths: DevCerts = {
    caCertPath: getCaCertPath(),
    caKeyPath: getCaKeyPath(),
    leafCertPath: getLeafCertPath(),
    leafKeyPath: getLeafKeyPath(),
    fullChainCertPath: getFullChainCertPath(),
  };

  if (certsExist() && !leafNeedsRegeneration(requiredSans)) {
    paths.fullChainCertPath = ensureFullChainCert();
    return paths;
  }

  if (certsExist()) {
    writeLeaf(requiredSans);
    paths.fullChainCertPath = ensureFullChainCert();
    return paths;
  }

  const ca = createCa();
  const leaf = createLeaf(ca.cert, ca.keys.privateKey, requiredSans);

  writePemPair(
    paths.caCertPath,
    paths.caKeyPath,
    forge.pki.certificateToPem(ca.cert),
    forge.pki.privateKeyToPem(ca.keys.privateKey),
  );

  writePemPair(
    paths.leafCertPath,
    paths.leafKeyPath,
    forge.pki.certificateToPem(leaf.cert),
    forge.pki.privateKeyToPem(leaf.keys.privateKey),
  );
  writeSanManifest(requiredSans);

  paths.fullChainCertPath = ensureFullChainCert();
  return paths;
}

/** nginx ssl_certificate must include the issuing CA after the leaf. */
export function ensureFullChainCert(): string {
  const leafPath = getLeafCertPath();
  const caPath = getCaCertPath();
  const outPath = getFullChainCertPath();
  const chain =
    fs.readFileSync(leafPath, 'utf8').trim() + '\n' + fs.readFileSync(caPath, 'utf8').trim() + '\n';
  fs.writeFileSync(outPath, chain, 'utf8');
  return outPath;
}

/** Read DNS SAN entries from the current leaf certificate. */
export function readLeafSanNames(): string[] {
  const pem = fs.readFileSync(getLeafCertPath(), 'utf8');
  const cert = forge.pki.certificateFromPem(pem);
  const sanExt = cert.getExtension('subjectAltName') as { altNames?: { type: number; value: string }[] };
  if (!sanExt?.altNames) return [];
  return sanExt.altNames.filter((a) => a.type === 2).map((a) => a.value).sort();
}
