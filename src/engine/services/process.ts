import { ChildProcess, spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { BRAND, logPrefix } from '../../shared/brand';
import { getProcessImagePath } from '../nginx-port-check';
import { ensureDir, getRuntimeDir } from '../../shared/paths';
import { killProcessTree } from './kill-process-tree';
import { enableMysqlAllowNoPassword, findPidListeningOnPort } from './mysql';
import { readPostmasterPid } from './postgres';

export type ServiceState = 'stopped' | 'running' | 'not_configured' | 'error';

export interface ServiceStatus {
  name: string;
  state: ServiceState;
  pid?: number;
  message?: string;
}

export interface ManagedProcessOptions {
  listenPort?: number;
  dataDir?: string;
  spawnEnv?: Record<string, string>;
  /** Restart automatically after an unexpected exit (php-cgi on Windows). */
  supervise?: boolean;
  stderrLog?: string;
}

const START_SETTLE_MS = 400;
const MYSQL_START_SETTLE_MS = 4000;
const POSTGRES_START_SETTLE_MS = 8000;
const NGINX_STOP_SETTLE_MS = 600;
const POSTGRES_STOP_SETTLE_MS = 800;
const SUPERVISE_RESTART_MS = 2000;
const SUPERVISE_RESTART_MAX_FAILURES = 8;

export class ManagedProcess {
  private child: ChildProcess | null = null;
  private lastError = '';
  private intentionalStop = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private superviseFailures = 0;
  private readonly listenPort?: number;
  private readonly dataDir?: string;
  private readonly spawnEnv?: Record<string, string>;
  private readonly supervise: boolean;
  private readonly stderrLog?: string;

  constructor(
    public readonly name: string,
    private readonly binary: string,
    private readonly args: string[] = [],
    private readonly pidFileName?: string,
    private readonly cwd?: string,
    opts?: ManagedProcessOptions,
  ) {
    this.listenPort = opts?.listenPort;
    this.dataDir = opts?.dataDir;
    this.spawnEnv = opts?.spawnEnv;
    this.supervise = opts?.supervise ?? false;
    this.stderrLog = opts?.stderrLog;
  }

  get isConfigured(): boolean {
    return Boolean(this.binary) && fs.existsSync(this.binary);
  }

  get status(): ServiceStatus {
    if (!this.binary) {
      return { name: this.name, state: 'not_configured', message: 'binary path not set' };
    }
    if (!fs.existsSync(this.binary)) {
      return {
        name: this.name,
        state: 'not_configured',
        message: `binary not found: ${this.binary}`,
      };
    }
    const pid = this.resolveRunningPid();
    if (pid) {
      return { name: this.name, state: 'running', pid };
    }
    return { name: this.name, state: 'stopped' };
  }

  /** Running PID — not the short-lived pg_ctl parent on PostgreSQL. */
  private resolveRunningPid(): number | undefined {
    if (this.child?.pid && !this.child.killed && isProcessAlive(this.child.pid)) {
      return this.child.pid;
    }
    const fromRuntime = this.readPidFile();
    if (fromRuntime && isProcessAlive(fromRuntime)) {
      return fromRuntime;
    }
    if (this.name === 'postgres' && this.dataDir) {
      const postmaster = readPostmasterPid(this.dataDir);
      if (postmaster && isProcessAlive(postmaster)) {
        return postmaster;
      }
    }
    const listener = this.findRunningListenerPid();
    if (listener && isProcessAlive(listener)) {
      return listener;
    }
    return undefined;
  }

  async start(): Promise<void> {
    if (!this.isConfigured) {
      const msg = `${this.name}: configure binary path in config.toml`;
      this.lastError = msg;
      throw new Error(msg);
    }
    if (this.name === 'php-fpm' && this.args.length === 0) {
      const msg =
        `${this.name}: requires php-cgi.exe started with -b 127.0.0.1:9000 (check services.php.fpm_binary in config)`;
      this.lastError = msg;
      throw new Error(msg);
    }
    if (this.name === 'mysql' && this.args.length === 0) {
      const msg =
        `${this.name}: missing my.ini / data directory (reinstall MariaDB or check services.mysql in config)`;
      this.lastError = msg;
      throw new Error(msg);
    }
    if (this.name === 'postgres' && this.args.length === 0) {
      const msg =
        `${this.name}: missing data directory (reinstall PostgreSQL or click Re-apply in ${BRAND.name})`;
      this.lastError = msg;
      throw new Error(msg);
    }
    if (this.name === 'redis' && this.args.length > 0) {
      const conf = this.args[0];
      if (!fs.existsSync(conf)) {
        const msg = `${this.name}: config not found (${conf}). Click Apply in ${BRAND.name} to generate redis.conf.`;
        this.lastError = msg;
        throw new Error(msg);
      }
    }
    if (this.name === 'redis' && this.args.length === 0) {
      const msg = `${this.name}: config path not set (click Apply or reinstall Redis)`;
      this.lastError = msg;
      throw new Error(msg);
    }
    const running = this.resolveRunningPid();
    if (running) {
      this.rememberPid(running);
      if (this.name === 'nginx') {
        this.nginxSignal('reload');
      }
      return;
    }

    const portListener = this.findRunningListenerPid();
    if (portListener && isProcessAlive(portListener)) {
      if (this.name === 'nginx') {
        if (!this.isNginxFromThisInstall(portListener)) {
          const msg =
            `${this.name}: port ${this.listenPort} is held by another program (PID ${portListener}). ` +
            'Stop Laragon/Herd/other nginx, then Start nginx again.';
          this.lastError = msg;
          throw new Error(msg);
        }
        this.rememberPid(portListener);
        this.nginxSignal('reload');
        return;
      }
      this.rememberPid(portListener);
      if (this.name === 'mysql') {
        this.bootstrapMysql(portListener);
      }
      return;
    }
    if (this.name === 'postgres' && this.dataDir) {
      const postmaster = readPostmasterPid(this.dataDir);
      if (postmaster && isProcessAlive(postmaster)) {
        this.rememberPid(postmaster);
        return;
      }
    }

    this.lastError = '';
    this.intentionalStop = false;
    this.clearRestartTimer();

    return new Promise((resolve, reject) => {
      let settled = false;
      const stderrChunks: Buffer[] = [];
      const stdoutChunks: Buffer[] = [];

      const stderrText = (): string => {
        const err = Buffer.concat(stderrChunks).toString('utf8').trim();
        const out = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const parts = [];
        if (err) parts.push(err);
        if (out) parts.push(out);
        return parts.join('\n');
      };

      const fail = (detail: string): void => {
        if (settled) return;
        settled = true;
        const msg = detail.startsWith(this.name)
          ? detail
          : `${this.name}: ${detail}`;
        this.lastError = msg;
        reject(new Error(msg));
      };

      try {
        const env = this.spawnEnv ? { ...process.env, ...this.spawnEnv } : process.env;
        this.child = spawn(this.binary, this.args, {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          cwd: this.cwd,
          env,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(msg);
        return;
      }

      if (!this.child) {
        fail('failed to spawn process');
        return;
      }

      this.child.stdout?.on('data', (d) => stdoutChunks.push(d));

      let stderrLogStream: fs.WriteStream | undefined;
      if (this.stderrLog) {
        ensureDir(path.dirname(this.stderrLog));
        stderrLogStream = fs.createWriteStream(this.stderrLog, { flags: 'a' });
        stderrLogStream.write(
          `\n--- ${this.name} started ${new Date().toISOString()} ---\n`,
        );
      }

      this.child.stderr?.on('data', (d) => {
        stderrChunks.push(d);
        stderrLogStream?.write(d);
      });

      const closeStderrLog = (): void => {
        if (!stderrLogStream) return;
        stderrLogStream.end();
        stderrLogStream = undefined;
      };

      // nginx/postgres daemonize — pg_ctl exits; postmaster.pid / port hold the real PID
      if (
        this.pidFileName &&
        this.child.pid &&
        this.name !== 'nginx' &&
        this.name !== 'postgres'
      ) {
        ensureDir(path.dirname(this.pidPath()));
        fs.writeFileSync(this.pidPath(), String(this.child.pid), 'utf8');
      }

      this.child.on('error', (err) => {
        fail(err.message);
      });

      this.child.on('exit', (code) => {
        closeStderrLog();
        this.child = null;
        if (settled) {
          this.scheduleSupervisedRestart();
          return;
        }
        // pg_ctl exits 0 after launching postmaster — wait for settle timer to adopt
        if (this.name === 'postgres' && code === 0) {
          return;
        }
        if (code !== 0 && code !== null) {
          if (this.tryAdoptPortListener()) {
            settled = true;
            resolve();
            return;
          }
          const output = stderrText();
          fail(
            output
              ? `exited with code ${code}\n${output}`
              : `exited with code ${code}`,
          );
          return;
        }
        this.scheduleSupervisedRestart();
      });

      const settleMs =
        this.name === 'mysql'
          ? MYSQL_START_SETTLE_MS
          : this.name === 'postgres'
            ? POSTGRES_START_SETTLE_MS
            : START_SETTLE_MS;

      setTimeout(() => {
        if (settled) return;
        const pid = this.resolveRunningPid();
        if (pid) {
          this.rememberPid(pid);
          settled = true;
          if (this.name === 'mysql') {
            const defaultsArg = this.args.find((a) => a.startsWith('--defaults-file='));
            if (defaultsArg && this.binary) {
              enableMysqlAllowNoPassword(
                this.binary,
                defaultsArg.slice('--defaults-file='.length),
              );
            }
          }
          resolve();
          return;
        }
        if (this.tryAdoptPortListener()) {
          settled = true;
          resolve();
          return;
        }
        const output = stderrText();
        fail(output ? `failed to start\n${output}` : 'failed to start (process exited immediately)');
      }, settleMs);
    });
  }

  private collectStopPids(): number[] {
    const seen = new Set<number>();
    const add = (pid: number | undefined) => {
      if (pid && isProcessAlive(pid)) seen.add(pid);
    };
    add(this.child?.pid);
    add(this.readPidFile());
    if (this.name === 'postgres' && this.dataDir) {
      add(readPostmasterPid(this.dataDir));
    }
    add(this.findRunningListenerPid());
    return [...seen];
  }

  private killServiceProcesses(pids: number[]): void {
    for (const pid of pids) {
      killProcessTree(pid);
    }
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    this.clearRestartTimer();

    if (this.name === 'nginx') {
      await this.stopNginx();
      return;
    }

    if (this.name === 'postgres' && this.dataDir && this.binary && this.args.length > 0) {
      spawnSync(this.binary, ['-D', this.dataDir, 'stop', 'fast'], {
        encoding: 'utf8',
        windowsHide: true,
        cwd: this.cwd,
      });
      await new Promise((r) => setTimeout(r, POSTGRES_STOP_SETTLE_MS));
    }

    this.child = null;
    this.killServiceProcesses(this.collectStopPids());

    if (fs.existsSync(this.pidPath())) {
      fs.unlinkSync(this.pidPath());
    }
    this.lastError = '';
    // intentionalStop stays true until the next explicit start() (see stopNginx too).
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private isOpcacheAslrFailure(msg: string): boolean {
    return /Opcode handlers are unusable due to ASLR/i.test(msg);
  }

  private superviseRestartDelayMs(): number {
    if (!this.isOpcacheAslrFailure(this.lastError)) return SUPERVISE_RESTART_MS;
    return Math.min(120_000, 10_000 * (this.superviseFailures + 1));
  }

  /** Restart supervised services after an unexpected exit. */
  private scheduleSupervisedRestart(): void {
    if (!this.supervise || this.intentionalStop || this.restartTimer) return;
    if (this.superviseFailures >= SUPERVISE_RESTART_MAX_FAILURES) {
      console.warn(
        `${logPrefix()} ${this.name}: supervised restart paused after repeated failures. ` +
          `Use Re-apply in ${BRAND.name} to refresh php.ini, then Start PHP.`,
      );
      return;
    }
    this.superviseFailures += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.intentionalStop) return;
      void this.start()
        .then(() => {
          this.superviseFailures = 0;
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`${logPrefix()} ${this.name} supervised restart failed:`, msg);
          this.scheduleSupervisedRestart();
        });
    }, this.superviseRestartDelayMs());
  }

  private async stopNginx(): Promise<void> {
    this.child = null;

    if (this.isConfigured && this.args.length >= 4) {
      this.nginxSignal('quit');
      await new Promise((r) => setTimeout(r, NGINX_STOP_SETTLE_MS));
    }

    const pids = new Set(this.findNginxInstallPids());
    for (const pid of this.collectStopPids()) {
      pids.add(pid);
    }
    this.killServiceProcesses([...pids]);

    if (fs.existsSync(this.pidPath())) {
      fs.unlinkSync(this.pidPath());
    }
    this.lastError = '';
  }

  /** All nginx.exe processes from this install directory (master, workers, stray spawns). */
  private findNginxInstallPids(): number[] {
    if (process.platform !== 'win32' || !this.binary) return [];

    const installDir = path.dirname(path.resolve(this.binary)).toLowerCase();
    const seen = new Set<number>();
    const fromPidFile = this.readPidFile();
    if (fromPidFile) seen.add(fromPidFile);

    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-Process nginx -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }',
      ],
      { encoding: 'utf8', windowsHide: true },
    );

    for (const line of (ps.stdout ?? '').split(/\r?\n/)) {
      const id = Number(line.trim());
      if (!Number.isFinite(id) || id <= 0) continue;
      const exe = getProcessImagePath(id);
      if (!exe) continue;
      if (path.dirname(path.resolve(exe)).toLowerCase() === installDir) {
        seen.add(id);
      }
    }

    return [...seen];
  }

  private pidPath(): string {
    if (this.pidFileName && path.isAbsolute(this.pidFileName)) {
      return this.pidFileName;
    }
    return path.join(getRuntimeDir(), this.pidFileName ?? `${this.name}.pid`);
  }

  private isNginxFromThisInstall(pid: number): boolean {
    if (!this.binary) return false;
    const exe = getProcessImagePath(pid);
    if (!exe) return false;
    const expected = path.dirname(path.resolve(this.binary)).toLowerCase();
    return path.dirname(path.resolve(exe)).toLowerCase() === expected;
  }

  private nginxSignal(signal: 'reload' | 'quit'): void {
    if (!this.binary || this.args.length < 4) return;
    spawnSync(this.binary, [...this.args, '-s', signal], {
      encoding: 'utf8',
      windowsHide: true,
    });
  }

  private findRunningListenerPid(): number | undefined {
    if (this.listenPort === undefined) return undefined;
    return findPidListeningOnPort(this.listenPort);
  }

  private rememberPid(pid: number): void {
    if (!this.pidFileName) return;
    ensureDir(path.dirname(this.pidPath()));
    fs.writeFileSync(this.pidPath(), String(pid), 'utf8');
  }

  private bootstrapMysql(_pid: number): void {
    const defaultsArg = this.args.find((a) => a.startsWith('--defaults-file='));
    if (defaultsArg && this.binary) {
      enableMysqlAllowNoPassword(this.binary, defaultsArg.slice('--defaults-file='.length));
    }
  }

  /** If the service is already listening, adopt it instead of failing. */
  private tryAdoptPortListener(): boolean {
    if (this.listenPort === undefined) return false;
    const pid = this.findRunningListenerPid();
    if (!pid || !isProcessAlive(pid)) return false;
    this.rememberPid(pid);
    if (this.name === 'mysql') {
      this.bootstrapMysql(pid);
    }
    return true;
  }

  private readPidFile(): number | undefined {
    const file = this.pidPath();
    if (!fs.existsSync(file)) return undefined;
    const n = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isFinite(n) ? n : undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
