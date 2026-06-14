import type { Site } from '../../config/types';
import { ManagedProcess, type ServiceStatus } from '../services';
import { buildDevServerSpawn, shouldRunDevServer } from './dev-server';

/** Resolves the Node bin directory (containing node.exe) for a site, or null. */
export type NodeDirResolver = (site: Site) => Promise<string | null>;

/**
 * Supervises one Node dev server per enabled Node/React/Next.js site. Mirrors
 * SiteReverbManager: reconcile desired vs running on sync, restart on demand,
 * stop everything on quit. nginx reverse-proxies the site's .test host to the
 * dev server's port.
 */
export class SiteDevServerManager {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly ports = new Map<string, number>();

  getStatus(siteName: string): ServiceStatus {
    const proc = this.processes.get(siteName);
    if (proc) return proc.status;
    return { name: `dev:${siteName}`, state: 'stopped' };
  }

  async sync(sites: Site[], resolveNodeDir: NodeDirResolver): Promise<void> {
    const active = new Set<string>();

    for (const site of sites) {
      if (!shouldRunDevServer(site)) continue;
      active.add(site.name);
      const desiredPort = site.dev_server!.port!;
      const proc = this.processes.get(site.name);
      const currentPort = this.ports.get(site.name);

      if (proc?.status.state === 'running' && currentPort === desiredPort) continue;

      if (proc) {
        await proc.stop();
        this.processes.delete(site.name);
        this.ports.delete(site.name);
      }

      const nodeDir = await resolveNodeDir(site);
      if (!nodeDir) continue; // no Node runtime — leave it stopped
      await this.startSite(site, desiredPort, nodeDir);
    }

    for (const [name, proc] of this.processes) {
      if (active.has(name)) continue;
      await proc.stop();
      this.processes.delete(name);
      this.ports.delete(name);
    }
  }

  async restart(site: Site, nodeDir: string | null): Promise<void> {
    if (!shouldRunDevServer(site)) {
      throw new Error('Dev server is not enabled for this site');
    }
    if (!nodeDir) {
      throw new Error('No Node.js runtime found — install a Node version (nvm) first');
    }
    const port = site.dev_server!.port!;
    const proc = this.processes.get(site.name);
    if (proc) {
      await proc.stop();
      this.processes.delete(site.name);
      this.ports.delete(site.name);
    }
    await this.startSite(site, port, nodeDir);
  }

  async stopSite(siteName: string): Promise<void> {
    const proc = this.processes.get(siteName);
    if (!proc) return;
    await proc.stop();
    this.processes.delete(siteName);
    this.ports.delete(siteName);
  }

  async stopAll(): Promise<void> {
    for (const [name, proc] of this.processes) {
      try {
        await proc.stop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dev-mgr] stop dev-server ${name}:`, msg);
      }
    }
    this.processes.clear();
    this.ports.clear();
  }

  private async startSite(site: Site, port: number, nodeDir: string): Promise<void> {
    const spawn = buildDevServerSpawn(site, port, nodeDir);
    const proc = new ManagedProcess(
      `dev:${site.name}`,
      spawn.binary,
      spawn.args,
      `dev-${site.name}.pid`,
      spawn.cwd,
      {
        listenPort: port,
        supervise: true,
        stderrLog: spawn.stderrLog,
        spawnEnv: spawn.env,
      },
    );
    this.processes.set(site.name, proc);
    this.ports.set(site.name, port);
    try {
      await proc.start();
    } catch (err) {
      this.processes.delete(site.name);
      this.ports.delete(site.name);
      throw err;
    }
  }
}
