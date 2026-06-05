import fs from 'fs';
import path from 'path';
import type { DevConfig, Site } from '../../config/types';
import { ensureDir, getGeneratedDir, getLogsDir } from '../../shared/paths';
import { renderNginxVhosts } from './nginx';

export function renderAll(config: DevConfig, sites: Site[]): void {
  for (const site of sites) {
    ensureDir(path.join(getLogsDir(), 'sites', site.name));
  }
  if (config.services.phpmyadmin.enabled && config.services.phpmyadmin.path) {
    ensureDir(path.join(getLogsDir(), 'sites', 'phpmyadmin'));
  }

  const nginxDir = path.join(getGeneratedDir(), 'nginx');
  ensureDir(nginxDir);
  fs.writeFileSync(
    path.join(nginxDir, 'devmgr-sites.conf'),
    renderNginxVhosts(config, sites),
    'utf8',
  );
}
