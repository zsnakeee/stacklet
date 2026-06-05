import fs from 'fs';

const DEFAULT_BYTES = 32 * 1024;

/**
 * Read the last N lines without loading the whole file.
 */
export function readTailLines(
  filePath: string,
  lineCount: number,
  maxBytes: number = DEFAULT_BYTES,
): string[] {
  if (!fs.existsSync(filePath)) return [];

  const stat = fs.statSync(filePath);
  if (stat.size === 0) return [];

  const fd = fs.openSync(filePath, 'r');
  try {
    let readSize = Math.min(maxBytes, stat.size);
    let position = stat.size - readSize;
    let buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, position);

    let text = buffer.toString('utf8');
    if (position > 0 && !text.startsWith('\n')) {
      const firstNl = text.indexOf('\n');
      if (firstNl !== -1) text = text.slice(firstNl + 1);
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-lineCount);
  } finally {
    fs.closeSync(fd);
  }
}
