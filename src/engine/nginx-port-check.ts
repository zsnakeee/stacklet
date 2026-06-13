import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { DevConfig } from '../config/types';
import { BRAND } from '../shared/brand';

function readProcessOutput(
  child: ReturnType<typeof spawn>,
): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve) => {
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve({ stdout, code: 1 }));
    child.on('close', (code) => resolve({ stdout, code }));
  });
}

export function getProcessImagePath(pid: number): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const ps = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`],
    { encoding: 'utf8', windowsHide: true },
  );
  const out = (ps.stdout ?? '').trim();
  return out || undefined;
}

async function getProcessImagePathAsync(pid: number): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined;
  const ps = spawn(
    'powershell.exe',
    ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const { stdout } = await readProcessOutput(ps);
  const out = stdout.trim();
  return out || undefined;
}

function findListeningPidsForPorts(ports: number[]): Map<number, number> {
  const result = new Map<number, number>();
  if (process.platform !== 'win32' || ports.length === 0) return result;

  const netstat = spawnSync('netstat', ['-ano'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const lines = (netstat.stdout ?? '').split(/\r?\n/);
  const tokens = new Set(ports.map((p) => `:${p}`));

  for (const line of lines) {
    if (!line.includes('LISTENING')) continue;
    const matched = [...tokens].find((t) => line.includes(t));
    if (!matched) continue;
    const port = Number(matched.slice(1));
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0 && !result.has(port)) {
      result.set(port, pid);
    }
  }
  return result;
}

async function findListeningPidsForPortsAsync(ports: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (process.platform !== 'win32' || ports.length === 0) return result;

  const netstat = spawn('netstat', ['-ano'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const { stdout } = await readProcessOutput(netstat);
  const lines = stdout.split(/\r?\n/);
  const tokens = new Set(ports.map((p) => `:${p}`));

  for (const line of lines) {
    if (!line.includes('LISTENING')) continue;
    const matched = [...tokens].find((t) => line.includes(t));
    if (!matched) continue;
    const port = Number(matched.slice(1));
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isFinite(pid) && pid > 0 && !result.has(port)) {
      result.set(port, pid);
    }
  }
  return result;
}

/** Warn when another web server (e.g. Laravel Herd) owns HTTP/HTTPS ports. */
export function detectWebPortConflict(config: DevConfig): string | undefined {
  const binary = config.services.nginx.binary;
  if (!binary || !fs.existsSync(binary)) return undefined;

  const expectedDir = path.dirname(path.resolve(binary)).toLowerCase();
  const ports = [config.services.nginx.port, config.services.nginx.ssl_port];
  const listeners = findListeningPidsForPorts(ports);

  for (const port of ports) {
    const pid = listeners.get(port);
    if (!pid) continue;
    const exe = getProcessImagePath(pid);
    if (!exe || !fs.existsSync(exe)) continue;
    const actualDir = path.dirname(path.resolve(exe)).toLowerCase();
    if (actualDir === expectedDir) continue;
    const name = path.basename(exe);
    return `Port ${port} is in use by ${name} (${exe}), not ${BRAND.name} nginx. Stop the other web server (e.g. Laravel Herd) and click Re-apply.`;
  }
  return undefined;
}

/** Non-blocking port conflict scan for dashboard status (avoids freezing the UI). */
export async function detectWebPortConflictAsync(
  config: DevConfig,
): Promise<string | undefined> {
  const binary = config.services.nginx.binary;
  if (!binary || !fs.existsSync(binary)) return undefined;

  const expectedDir = path.dirname(path.resolve(binary)).toLowerCase();
  const ports = [config.services.nginx.port, config.services.nginx.ssl_port];
  const listeners = await findListeningPidsForPortsAsync(ports);

  for (const port of ports) {
    const pid = listeners.get(port);
    if (!pid) continue;
    const exe = await getProcessImagePathAsync(pid);
    if (!exe || !fs.existsSync(exe)) continue;
    const actualDir = path.dirname(path.resolve(exe)).toLowerCase();
    if (actualDir === expectedDir) continue;
    const name = path.basename(exe);
    return `Port ${port} is in use by ${name} (${exe}), not ${BRAND.name} nginx. Stop the other web server (e.g. Laravel Herd) and click Re-apply.`;
  }
  return undefined;
}
