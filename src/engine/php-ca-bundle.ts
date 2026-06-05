import fs from 'fs';
import { downloadFile } from '../bundled/download';
import { ensureDir, getCaBundlePath, getCertsDir } from '../shared/paths';

/** Official Mozilla CA bundle used by curl, Composer, and PHP on Windows. */
export const CA_BUNDLE_URL = 'https://curl.se/ca/cacert.pem';

const MIN_BUNDLE_BYTES = 1024;

/** True when the file looks like a PEM CA bundle (curl.se or raw certs). */
export function isValidCaBundle(bundlePath: string): boolean {
  if (!fs.existsSync(bundlePath)) return false;
  if (fs.statSync(bundlePath).size < MIN_BUNDLE_BYTES) return false;

  const head = fs.readFileSync(bundlePath, 'utf8').slice(0, 8192);
  if (head.includes('-----BEGIN CERTIFICATE-----')) return true;
  if (/^##\s/m.test(head) && /certificate/i.test(head)) return true;
  return false;
}

export async function ensureCaBundle(): Promise<string> {
  const bundlePath = getCaBundlePath();
  ensureDir(getCertsDir());

  if (isValidCaBundle(bundlePath)) {
    return bundlePath;
  }

  if (fs.existsSync(bundlePath)) {
    fs.unlinkSync(bundlePath);
  }

  await downloadFile(CA_BUNDLE_URL, bundlePath);

  if (!isValidCaBundle(bundlePath)) {
    fs.unlinkSync(bundlePath);
    throw new Error(
      'Downloaded CA bundle is invalid. Check your network connection and click Re-apply.',
    );
  }

  return bundlePath;
}
