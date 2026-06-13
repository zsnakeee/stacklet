import fs from 'fs';
import path from 'path';
import type { Site } from '../config/types';

const MANAGED_KEYS = [
  'REVERB_HOST',
  'REVERB_PORT',
  'REVERB_SCHEME',
  'REVERB_SERVER_HOST',
  'REVERB_SERVER_PORT',
  'VITE_REVERB_HOST',
  'VITE_REVERB_PORT',
  'VITE_REVERB_SCHEME',
] as const;

const PROTECTED_PREFIX = 'REVERB_APP_';

export function suggestReverbEnv(
  site: Site,
  sslPort: number,
  reverbPort: number,
): Record<string, string> {
  return {
    REVERB_HOST: site.hostname,
    REVERB_PORT: String(sslPort),
    REVERB_SCHEME: 'https',
    REVERB_SERVER_HOST: '127.0.0.1',
    REVERB_SERVER_PORT: String(reverbPort),
    VITE_REVERB_HOST: '${REVERB_HOST}',
    VITE_REVERB_PORT: '${REVERB_PORT}',
    VITE_REVERB_SCHEME: '${REVERB_SCHEME}',
  };
}

function parseEnvLines(content: string): { lines: string[]; values: Map<string, string> } {
  const lines = content.split(/\r?\n/);
  const values = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return { lines, values };
}

function formatEnvLine(key: string, value: string): string {
  if (/[\s#"]/.test(value)) {
    return `${key}="${value.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${value}`;
}

/** Patch .env with Stacklet Reverb values; never overwrites REVERB_APP_* secrets. */
export function applyReverbEnv(site: Site, sslPort: number, reverbPort: number): string[] {
  const envPath = path.join(site.root, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env not found in project root');
  }

  const suggested = suggestReverbEnv(site, sslPort, reverbPort);
  const content = fs.readFileSync(envPath, 'utf8');
  const { lines, values } = parseEnvLines(content);
  const updatedKeys: string[] = [];

  const nextLines = [...lines];
  const touched = new Set<string>();

  for (const key of MANAGED_KEYS) {
    if (key.startsWith(PROTECTED_PREFIX)) continue;
    const newValue = suggested[key];
    if (newValue === undefined) continue;

    const existingIdx = nextLines.findIndex((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith(`${key}=`) || trimmed.startsWith(`${key} =`);
    });

    if (existingIdx >= 0) {
      const oldKey = nextLines[existingIdx].trim().split('=')[0]?.trim();
      if (oldKey?.startsWith(PROTECTED_PREFIX)) continue;
      nextLines[existingIdx] = formatEnvLine(key, newValue);
    } else {
      nextLines.push(formatEnvLine(key, newValue));
    }
    touched.add(key);
    if (values.get(key) !== newValue) updatedKeys.push(key);
  }

  if (updatedKeys.length === 0 && touched.size === 0) {
    return [];
  }

  fs.writeFileSync(envPath, nextLines.join('\n').replace(/\n*$/, '\n'), 'utf8');
  return updatedKeys;
}

export function formatReverbEnvSuggestion(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([k, v]) => formatEnvLine(k, v))
    .join('\n');
}
