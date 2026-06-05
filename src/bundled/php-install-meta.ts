import fs from 'fs';
import path from 'path';

const META_FILE = '.devmgr-php.json';

export interface PhpInstallMeta {
  /** e.g. nts-vs17-x64 */
  variantKey: string;
}

export function parsePhpVariantFromZipUrl(url: string): string | null {
  const m = /(nts|ts)-(vs\d+|vc\d+)-x64/i.exec(url);
  if (!m) return null;
  return `${m[1].toLowerCase()}-${m[2].toLowerCase()}-x64`;
}

export function readPhpInstallMeta(phpRoot: string): PhpInstallMeta | null {
  const file = path.join(phpRoot, META_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as PhpInstallMeta;
    if (data?.variantKey) return data;
  } catch {
    // ignore
  }
  return null;
}

export function writePhpInstallMeta(phpRoot: string, variantKey: string): void {
  const file = path.join(phpRoot, META_FILE);
  fs.writeFileSync(file, JSON.stringify({ variantKey }, null, 2), 'utf8');
}
