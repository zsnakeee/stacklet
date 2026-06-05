import { spawnSync } from 'child_process';
import type { DevConfig } from '../config/types';

/** Reload nginx after vhost config changes. */
export function reloadNginx(config: DevConfig): void {
  const nginx = config.services.nginx;
  if (!nginx.binary || !nginx.config || !nginx.prefix) return;

  const args = ['-p', nginx.prefix, '-c', nginx.config, '-s', 'reload'];
  const test = spawnSync(nginx.binary, ['-p', nginx.prefix, '-c', nginx.config, '-t'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (test.status !== 0) {
    const msg = [test.stderr, test.stdout].filter(Boolean).join('\n').trim();
    throw new Error(msg || 'nginx configuration test failed');
  }

  const result = spawnSync(nginx.binary, args, {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    const msg = [result.stderr, test.stdout].filter(Boolean).join('\n').trim();
    throw new Error(msg || 'nginx reload failed (is nginx running?)');
  }
}
