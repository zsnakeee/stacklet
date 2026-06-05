import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDataDir, ensureDir } from '../shared/paths';

export function getHelperPidPath(): string {
  return path.join(getDataDir(), 'helper.pid');
}

/** Stop a previously launched elevated helper so the pipe can be recreated. */
export function stopExistingHelper(): void {
  const pidPath = getHelperPidPath();
  if (!fs.existsSync(pidPath)) return;

  const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
  if (!Number.isFinite(pid) || pid <= 0) {
    fs.unlinkSync(pidPath);
    return;
  }

  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // already stopped
  }

  if (fs.existsSync(pidPath)) {
    fs.unlinkSync(pidPath);
  }
}

export function writeHelperPid(pid: number = process.pid): void {
  ensureDir(getDataDir());
  fs.writeFileSync(getHelperPidPath(), String(pid), 'utf8');
}
