import {
  HelperClient,
  getHelperLogPath,
  launchHelper,
  stopExistingHelper,
} from '../helper';

/**
 * Manages the privileged helper lifecycle and exposes typed op calls.
 */
export class HelperService {
  private client: HelperClient | null = null;
  private opChain: Promise<void> = Promise.resolve();
  /** Dedupes parallel ensureReady / launchHelper — one UAC per app session when possible. */
  private readyPromise: Promise<HelperClient> | null = null;

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(fn);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async isCurrentHelper(client: HelperClient): Promise<boolean> {
    const pong = await client.ping();
    return client.isCurrentProtocol(pong);
  }

  private async connectFreshClient(): Promise<HelperClient> {
    const client = new HelperClient();
    client.loadToken();
    await client.connect();
    this.client = client;
    return client;
  }

  private launchError(cause: unknown, connectErr?: unknown): Error {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const logPath = getHelperLogPath();
    const connectHint =
      connectErr instanceof Error
        ? connectErr.message
        : connectErr !== undefined
          ? String(connectErr)
          : '';
    const suffix = connectHint ? `\n(connect failed: ${connectHint})` : '';
    return new Error(`${detail}${suffix}\nHelper log: ${logPath}`);
  }

  private async tryReuseRunningHelper(): Promise<HelperClient | null> {
    const probe = new HelperClient();
    try {
      probe.loadToken();
      await probe.connect(2000);
      if (!(await this.isCurrentHelper(probe))) {
        return null;
      }
      return this.connectFreshClient();
    } catch {
      return null;
    } finally {
      probe.disconnect();
    }
  }

  private async acquireHelper(): Promise<HelperClient> {
    if (this.client?.isConnected) {
      try {
        if (await this.isCurrentHelper(this.client)) {
          return this.client;
        }
      } catch {
        this.disconnect();
      }
    }

    const reused = await this.tryReuseRunningHelper();
    if (reused) return reused;

    let connectErr: unknown;
    try {
      stopExistingHelper();
      await new Promise((r) => setTimeout(r, 500));
      await launchHelper();
      return this.connectFreshClient();
    } catch (err) {
      connectErr = err;
      const hint = err instanceof Error ? err.message : String(err);
      if (hint.includes('EPERM') || hint.includes('EACCES')) {
        stopExistingHelper();
        await new Promise((r) => setTimeout(r, 500));
        try {
          await launchHelper();
          return this.connectFreshClient();
        } catch (retryErr) {
          throw this.launchError(retryErr, connectErr);
        }
      }
      throw this.launchError(err, connectErr);
    }
  }

  /** Launch helper via UAC if needed, then connect. Restarts stale elevated helpers once. */
  ensureReady(): Promise<HelperClient> {
    if (!this.readyPromise) {
      this.readyPromise = this.acquireHelper().finally(() => {
        this.readyPromise = null;
      });
    }
    return this.readyPromise;
  }

  async ping(): Promise<{ pong: boolean; pid: number }> {
    return this.runExclusive(async () => {
      const client = await this.ensureReady();
      return client.ping();
    });
  }

  async hostsAdd(hostname: string, ip: string = '127.0.0.1'): Promise<void> {
    return this.runExclusive(async () => {
      const client = await this.ensureReady();
      await client.hostsAdd(hostname, ip);
    });
  }

  async hostsRemove(hostname: string): Promise<void> {
    return this.runExclusive(async () => {
      const client = await this.ensureReady();
      await client.hostsRemove(hostname);
    });
  }

  async hostsSync(hostnames: string[], ip: string = '127.0.0.1'): Promise<void> {
    return this.runExclusive(async () => {
      const client = await this.ensureReady();
      await client.hostsSync(hostnames, ip);
    });
  }

  async certInstall(certPath: string): Promise<void> {
    return this.runExclusive(async () => {
      const client = await this.ensureReady();
      await client.certInstall(certPath);
    });
  }

  disconnect(): void {
    this.readyPromise = null;
    this.client?.disconnect();
    this.client = null;
  }
}
