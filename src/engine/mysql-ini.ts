import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import {
  mergeMysqlIniOptions,
  myIniPath,
  readMysqlIniOptions,
  writeMyIni,
} from '../bundled/mysql-configure';
import { getInstallDir } from '../bundled/registry';
import type { MysqlIniOptions } from '../config/types';

export function getMysqlInstallPath(version: string): string | null {
  const dir = getInstallDir('mysql', version);
  const mysqld = path.join(dir, 'bin', 'mysqld.exe');
  if (fs.existsSync(mysqld)) return dir;
  if (fs.existsSync(path.join(dir, 'mysqld.exe'))) return dir;
  return null;
}

export function getMysqlIniForVersion(
  version: string,
  dataDir: string,
): { iniPath: string; installRoot: string; dataDir: string } | null {
  const installRoot = getMysqlInstallPath(version);
  if (!installRoot) return null;
  return {
    installRoot,
    iniPath: myIniPath(installRoot),
    dataDir,
  };
}

export function readMysqlSettingsFromDisk(
  iniPath: string,
  configOptions?: Partial<MysqlIniOptions>,
): MysqlIniOptions {
  const fromIni = readMysqlIniOptions(iniPath);
  return mergeMysqlIniOptions({ ...configOptions, ...fromIni });
}

export function applyMysqlIni(
  installRoot: string,
  dataDir: string,
  port: number,
  options: Partial<MysqlIniOptions>,
): string {
  return writeMyIni(installRoot, dataDir, port, options);
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

export function openMysqlIniInEditor(iniPath: string): void {
  let editor = process.env['DEVMGR_MYSQL_EDITOR'] ?? process.env['DEVMGR_PHP_EDITOR'];
  if (!editor) {
    editor = NOTEPAD_PLUS_PATHS.find((p) => p && fs.existsSync(p));
  }
  if (!editor) {
    editor = path.join(process.env['WINDIR'] ?? 'C:\\Windows', 'notepad.exe');
  }

  const child = spawn(editor, [iniPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}
