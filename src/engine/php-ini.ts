import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getPhpInstallPath } from '../bundled/installed-versions';

export const PHP_QUICK_KEYS = [
  'memory_limit',
  'upload_max_filesize',
  'post_max_size',
  'max_execution_time',
  'max_input_time',
  'display_errors',
  'error_reporting',
  'date.timezone',
] as const;

export type PhpQuickKey = (typeof PHP_QUICK_KEYS)[number];

export type PhpQuickSettings = Record<PhpQuickKey, string>;

export function resolvePhpIniPath(phpRoot: string): string | null {
  const candidates = [
    path.join(phpRoot, 'php.ini'),
    path.join(phpRoot, 'php.ini-development'),
    path.join(phpRoot, 'php.ini-production'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function getPhpIniForVersion(version: string): { iniPath: string; phpRoot: string } | null {
  const phpRoot = getPhpInstallPath(version);
  if (!phpRoot) return null;
  const iniPath = resolvePhpIniPath(phpRoot);
  if (!iniPath) return null;
  return { iniPath, phpRoot };
}

function parseIniLines(content: string): Map<string, { value: string; lineIndex: number }> {
  const map = new Map<string, { value: string; lineIndex: number }>();
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    map.set(key, { value, lineIndex: i });
  }
  return map;
}

export function readPhpQuickSettings(iniPath: string): PhpQuickSettings {
  const content = fs.readFileSync(iniPath, 'utf8');
  const parsed = parseIniLines(content);
  const out = {} as PhpQuickSettings;
  for (const key of PHP_QUICK_KEYS) {
    out[key] = parsed.get(key)?.value ?? '';
  }
  return out;
}

export function writePhpQuickSettings(iniPath: string, patch: Partial<PhpQuickSettings>): void {
  const content = fs.readFileSync(iniPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const parsed = parseIniLines(content);

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') continue;
    const existing = parsed.get(key);
    const line = `${key} = ${value}`;
    if (existing) {
      lines[existing.lineIndex] = line;
    } else {
      lines.push(line);
    }
  }

  fs.writeFileSync(iniPath, lines.join('\n'), 'utf8');
}

const NOTEPAD_PLUS_PATHS = [
  path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Notepad++', 'notepad++.exe'),
  path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Notepad++',
    'notepad++.exe',
  ),
  path.join(
    process.env['LOCALAPPDATA'] ?? '',
    'Programs',
    'Notepad++',
    'notepad++.exe',
  ),
];

export function openPhpIniInEditor(iniPath: string): void {
  let editor = process.env['DEVMGR_PHP_EDITOR'];
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
