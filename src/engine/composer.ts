import fs from 'fs';
import path from 'path';
import { downloadFile } from '../bundled/download';
import { getDataDir } from '../shared/paths';

const COMPOSER_URL = 'https://getcomposer.org/download/latest-stable/composer.phar';

export function getComposerDir(): string {
  return path.join(getDataDir(), 'tools', 'composer');
}
export function getComposerPhar(): string {
  return path.join(getComposerDir(), 'composer.phar');
}
export function getComposerBat(): string {
  return path.join(getComposerDir(), 'composer.bat');
}

export interface ComposerStatus {
  installed: boolean;
  dir: string;
  pharPath: string;
}

export function getComposerStatus(): ComposerStatus {
  return {
    installed: fs.existsSync(getComposerPhar()) && fs.existsSync(getComposerBat()),
    dir: getComposerDir(),
    pharPath: getComposerPhar(),
  };
}

/**
 * Download composer.phar and write a `composer.bat` wrapper. The wrapper calls
 * `php` from PATH (not a pinned version), so Composer always uses whatever PHP
 * is the active default — switching the default PHP "just works" for composer.
 */
export async function installComposer(
  onProgress?: (message: string) => void,
): Promise<ComposerStatus> {
  const dir = getComposerDir();
  fs.mkdirSync(dir, { recursive: true });
  onProgress?.('Downloading composer.phar…');
  await downloadFile(COMPOSER_URL, getComposerPhar());
  const bat = ['@echo off', 'php "%~dp0composer.phar" %*', ''].join('\r\n');
  fs.writeFileSync(getComposerBat(), bat, 'utf8');
  onProgress?.('Composer installed.');
  return getComposerStatus();
}
