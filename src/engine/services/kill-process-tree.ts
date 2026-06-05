import { spawnSync } from 'child_process';

/** Kill a process and its descendants. */
export function killProcessTree(pid: number): void {
  if (!Number.isFinite(pid) || pid <= 0) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }
  spawnSync('pkill', ['-TERM', '-P', String(pid)], { stdio: 'ignore' });
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
}
