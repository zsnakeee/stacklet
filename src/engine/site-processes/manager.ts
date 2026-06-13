import type { DevConfig, Site } from '../../config/types';
import { ManagedProcess, type ServiceStatus } from '../services';
import { buildReverbSpawn, shouldRunReverb } from './reverb';

export class SiteReverbManager {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly ports = new Map<string, number>();

  getStatus(siteName: string): ServiceStatus {
    const proc = this.processes.get(siteName);
    if (proc) return proc.status;
    return { name: `reverb:${siteName}`, state: 'stopped' };
  }

  async sync(sites: Site[], _config: DevConfig): Promise<void> {
    const active = new Set<string>();

    for (const site of sites) {
      if (!shouldRunReverb(site)) continue;
      active.add(site.name);
      const desiredPort = site.reverb!.port!;
      const proc = this.processes.get(site.name);
      const currentPort = this.ports.get(site.name);

      if (proc?.status.state === 'running' && currentPort === desiredPort) {
        continue;
      }

      if (proc) {
        await proc.stop();
        this.processes.delete(site.name);
        this.ports.delete(site.name);
      }

      await this.startSite(site, desiredPort);
    }

    for (const [name, proc] of this.processes) {
      if (active.has(name)) continue;
      await proc.stop();
      this.processes.delete(name);
      this.ports.delete(name);
    }
  }

  async restart(site: Site): Promise<void> {
    if (!shouldRunReverb(site)) {
      throw new Error('Reverb is not enabled for this site');
    }
    const port = site.reverb!.port!;
    const proc = this.processes.get(site.name);
    if (proc) {
      await proc.stop();
      this.processes.delete(site.name);
      this.ports.delete(site.name);
    }
    await this.startSite(site, port);
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
        console.warn(`[dev-mgr] stop reverb ${name}:`, msg);
      }
    }
    this.processes.clear();
    this.ports.clear();
  }

  private async startSite(site: Site, port: number): Promise<void> {
    const spawn = buildReverbSpawn(site, port);
    const proc = new ManagedProcess(
      `reverb:${site.name}`,
      spawn.binary,
      spawn.args,
      `reverb-${site.name}.pid`,
      spawn.cwd,
      {
        listenPort: port,
        supervise: true,
        stderrLog: spawn.stderrLog,
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
