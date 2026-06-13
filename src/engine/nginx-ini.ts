import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import {
  mergeNginxOptions,
  readStackletHttpConf,
  stackletHttpConfPath,
} from '../bundled/nginx-configure';
import { readEnv } from '../shared/brand';
import { nginxPathsFromInstallRoot } from '../bundled/nginx-paths';
import { getInstallDir } from '../bundled/registry';
import type { NginxOptions } from '../config/types';

export function getNginxInstallPath(version: string): string | null {
  const dir = getInstallDir('nginx', version);
  const paths = nginxPathsFromInstallRoot(dir);
  return paths ? dir : null;
}

export function readNginxSettingsFromDisk(
  configOptions?: Partial<NginxOptions>,
): NginxOptions {
  const fromFile = readStackletHttpConf(stackletHttpConfPath());
  return mergeNginxOptions({ ...configOptions, ...fromFile });
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

export function openNginxConfInEditor(configPath: string): void {
  let editor = readEnv('NGINX_EDITOR') ?? readEnv('PHP_EDITOR');
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
