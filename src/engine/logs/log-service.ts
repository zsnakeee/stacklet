import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import type { Site } from '../../config/types';
import { getLogsDir } from '../../shared/paths';
import { LogAllowlist } from './allowlist';
import { readTailLines } from './read-tail';
import { buildLogSources, type LogSource } from './sources';

type LogWatcher = ReturnType<typeof chokidar.watch>;

export type LogAppendHandler = (payload: {
  id: string;
  chunk: string;
}) => void;

export class LogService {
  private sources: LogSource[] = [];
  private allowlist!: LogAllowlist;
  private watchers = new Map<string, LogWatcher>();
  private offsets = new Map<string, number>();

  refresh(sites: Site[], phpVersion: string): void {
    this.sources = buildLogSources(sites, phpVersion);
    this.allowlist = new LogAllowlist(this.sources, [getLogsDir()]);
  }

  listSources(): LogSource[] {
    return this.sources.map((s) => ({
      id: s.id,
      label: s.label,
      path: s.path,
      kind: s.kind,
    }));
  }

  readTail(id: string, lines: number): string[] {
    const filePath = this.allowlist.resolve(id);
    return readTailLines(filePath, lines);
  }

  follow(id: string, onAppend: LogAppendHandler): void {
    if (this.watchers.has(id)) return;

    const filePath = this.allowlist.resolve(id);
    ensureFile(filePath);

    const offset = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    this.offsets.set(id, offset);

    const watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    const readNew = (): void => {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      let pos = this.offsets.get(id) ?? 0;

      if (stat.size < pos) {
        pos = 0;
      }
      if (stat.size <= pos) return;

      const fd = fs.openSync(filePath, 'r');
      try {
        const len = stat.size - pos;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, pos);
        this.offsets.set(id, stat.size);
        onAppend({ id, chunk: buf.toString('utf8') });
      } finally {
        fs.closeSync(fd);
      }
    };

    watcher.on('change', readNew);
    this.watchers.set(id, watcher);
  }

  unfollow(id: string): void {
    const watcher = this.watchers.get(id);
    if (watcher) {
      void watcher.close();
      this.watchers.delete(id);
      this.offsets.delete(id);
    }
  }

  unfollowAll(): void {
    for (const id of [...this.watchers.keys()]) {
      this.unfollow(id);
    }
  }
}

function ensureFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf8');
  }
}
