import fs from 'fs';
import path from 'path';
import type { LogSource } from './sources';

export class LogAllowlist {
  private readonly pathById = new Map<string, string>();
  private readonly allowedRoots: string[];

  constructor(sources: LogSource[], extraRoots: string[] = []) {
    for (const s of sources) {
      this.pathById.set(s.id, path.resolve(s.path));
    }
    this.allowedRoots = [
      ...new Set([
        ...sources.map((s) => path.resolve(path.dirname(s.path))),
        ...extraRoots.map((r) => path.resolve(r)),
      ]),
    ];
  }

  resolve(id: string): string {
    const resolved = this.pathById.get(id);
    if (!resolved) {
      throw new Error(`unknown log source: ${id}`);
    }
    this.assertAllowed(resolved);
    return resolved;
  }

  private assertAllowed(filePath: string): void {
    const real = safeRealpath(filePath);
    const ok = this.allowedRoots.some(
      (root) => real === root || real.startsWith(root + path.sep),
    );
    if (!ok) {
      throw new Error('log path is outside the allowlist');
    }
  }
}

function safeRealpath(filePath: string): string {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}
