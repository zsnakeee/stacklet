import fs from 'fs';
import path from 'path';
import type { DevConfig, Site } from '../../config/types';
import { ensureDir, getGeneratedDir, getLogsDir } from '../../shared/paths';
import { dashboardDocRoot, renderNginxVhosts } from './nginx';
import { renderApacheVhosts } from './apache';
import { renderDashboardHtml } from './dashboard';
import { apacheGeneratedDir, apacheSitesConfPath } from '../../bundled/apache-configure';
import {
  getActivePhpVersion,
  getPhpInstallPath,
  listInstalledVersionDirs,
} from '../../bundled/installed-versions';
import { phpPortForVersion } from '../php-isolation';

export function renderAll(config: DevConfig, sites: Site[]): void {
  const activePhp = getActivePhpVersion() ?? config.services.php.version;
  const installedPhp = listInstalledVersionDirs('php');
  const phpPort = (site: Site): number =>
    phpPortForVersion(site.php_version, activePhp, installedPhp);

  const activePhpRoot = getPhpInstallPath(activePhp);
  const xdebugActive =
    config.general.xdebug === true &&
    !!activePhpRoot &&
    fs.existsSync(path.join(activePhpRoot, 'ext', 'php_xdebug.dll'));
  for (const site of sites) {
    ensureDir(path.join(getLogsDir(), 'sites', site.name));
  }
  if (config.services.phpmyadmin.enabled && config.services.phpmyadmin.path) {
    ensureDir(path.join(getLogsDir(), 'sites', 'phpmyadmin'));
  }
  // Logs dir for the catch-all default server (http://127.0.0.1/).
  ensureDir(path.join(getLogsDir(), 'sites', 'default'));

  // Stacklet dashboard served at http://127.0.0.1/ when no default site is set.
  const dashDir = dashboardDocRoot();
  ensureDir(dashDir);
  fs.writeFileSync(path.join(dashDir, 'index.html'), renderDashboardHtml(config, sites), 'utf8');

  const nginxDir = path.join(getGeneratedDir(), 'nginx');
  ensureDir(nginxDir);
  fs.writeFileSync(
    path.join(nginxDir, 'stacklet-sites.conf'),
    renderNginxVhosts(config, sites, phpPort, xdebugActive),
    'utf8',
  );

  // Apache vhosts (used when web_server === 'apache'); harmless to always emit.
  ensureDir(apacheGeneratedDir());
  fs.writeFileSync(
    apacheSitesConfPath(),
    renderApacheVhosts(config, sites, phpPort, xdebugActive),
    'utf8',
  );
}
