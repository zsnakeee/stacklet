import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import {
  mergePhpMyAdminOptions,
  phpMyAdminConfigPath,
  readPhpMyAdminOptions,
  resolvePhpMyAdminRoot,
} from '../bundled/phpmyadmin-configure';
import { getInstallDir } from '../bundled/registry';
import type { PhpMyAdminOptions } from '../config/types';
import { readEnv } from '../shared/brand';

export function getPhpMyAdminInstallPath(version: string): string | null {
  const dir = getInstallDir('phpmyadmin', version);
  if (!resolvePhpMyAdminRoot(dir)) return null;
  return dir;
}

export function readPhpMyAdminSettingsFromDisk(
  installPath: string,
  configOptions?: Partial<PhpMyAdminOptions>,
  mysqlPort = 3306,
): PhpMyAdminOptions {
  const configFile = phpMyAdminConfigPath(installPath);
  const fromFile = configFile ? readPhpMyAdminOptions(configFile) : {};
  return mergePhpMyAdminOptions({ ...configOptions, ...fromFile }, mysqlPort);
}

const NOTEPAD_PLUS_PATHS = [
  path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Notepad++', 'notepad++.exe'),
  path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Notepad++',
    'notepad++.exe',
  ),
  path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Notepad++', 'notepad++.exe'),
];

export function openPhpMyAdminConfigInEditor(configPath: string): void {
  let editor = readEnv('PHPMYADMIN_EDITOR') ?? readEnv('PHP_EDITOR');
  if (!editor) {
    editor = NOTEPAD_PLUS_PATHS.find((p) => p && fs.existsSync(p));
  }
  if (!editor) {
    editor = path.join(process.env['WINDIR'] ?? 'C:\\Windows', 'notepad.exe');
  }

  const child = spawn(editor, [configPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}
