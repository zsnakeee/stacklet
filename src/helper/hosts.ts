import fs from 'fs';
import path from 'path';

export const HOSTS_MARKER_BEGIN = '# BEGIN devmgr';
export const HOSTS_MARKER_END = '# END devmgr';

/** System hosts file, overridable via DEVMGR_HOSTS_PATH for tests. */
export function getHostsPath(): string {
  if (process.env['DEVMGR_HOSTS_PATH']) {
    return process.env['DEVMGR_HOSTS_PATH'];
  }
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'drivers', 'etc', 'hosts');
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove hosts lines that map `hostname` to an IPv4 address. */
function stripHostnameLines(content: string, hostname: string): string {
  const lineRe = new RegExp(
    `^\\s*(?:\\d{1,3}\\.){3}\\d{1,3}\\s+${escapeRegex(hostname)}(?:\\s+#.*)?\\s*$`,
  );
  return content
    .split('\n')
    .filter((line) => !lineRe.test(line.replace(/\r$/, '')))
    .join('\n');
}

function ensureMarkerBlock(content: string): string {
  if (content.includes(HOSTS_MARKER_BEGIN)) {
    return content;
  }
  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return (
    content +
    suffix +
    `\n${HOSTS_MARKER_BEGIN}\n${HOSTS_MARKER_END}\n`
  );
}

function insertIntoBlock(content: string, line: string): string {
  const beginIdx = content.indexOf(HOSTS_MARKER_BEGIN);
  const endIdx = content.indexOf(HOSTS_MARKER_END, beginIdx);
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error('devmgr hosts marker block is missing');
  }
  const before = content.slice(0, endIdx);
  const after = content.slice(endIdx);
  const needsNewline = !before.endsWith('\n');
  return before + (needsNewline ? '\n' : '') + line + '\n' + after;
}

export function hostsAdd(
  ip: string,
  hostname: string,
  hostsPath: string = getHostsPath(),
): { added: boolean; ip: string; hostname: string } {
  if (!hostname) {
    throw new Error('hosts:add requires args.hostname');
  }

  let content = fs.existsSync(hostsPath)
    ? normalizeLineEndings(fs.readFileSync(hostsPath, 'utf8'))
    : '';

  content = stripHostnameLines(content, hostname);
  content = ensureMarkerBlock(content);
  content = insertIntoBlock(content, `${ip} ${hostname}`);
  fs.writeFileSync(hostsPath, content.replace(/\n/g, '\r\n'), 'utf8');

  return { added: true, ip, hostname };
}

export function hostsRemove(
  hostname: string,
  hostsPath: string = getHostsPath(),
): { removed: boolean; hostname: string } {
  if (!hostname) {
    throw new Error('hosts:remove requires args.hostname');
  }

  if (!fs.existsSync(hostsPath)) {
    return { removed: true, hostname };
  }

  let content = normalizeLineEndings(fs.readFileSync(hostsPath, 'utf8'));
  content = stripHostnameLines(content, hostname);

  const beginIdx = content.indexOf(HOSTS_MARKER_BEGIN);
  const endIdx = content.indexOf(HOSTS_MARKER_END, beginIdx);
  if (beginIdx !== -1 && endIdx !== -1) {
    const blockBody = content.slice(
      beginIdx + HOSTS_MARKER_BEGIN.length,
      endIdx,
    );
    if (!blockBody.trim()) {
      content =
        content.slice(0, beginIdx).trimEnd() +
        content.slice(endIdx + HOSTS_MARKER_END.length);
    }
  }

  fs.writeFileSync(hostsPath, content.replace(/\n/g, '\r\n'), 'utf8');
  return { removed: true, hostname };
}

function replaceMarkerBlockBody(content: string, bodyLines: string[]): string {
  const beginIdx = content.indexOf(HOSTS_MARKER_BEGIN);
  const endIdx = content.indexOf(HOSTS_MARKER_END, beginIdx);
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error('devmgr hosts marker block is missing');
  }
  const before = content.slice(0, beginIdx + HOSTS_MARKER_BEGIN.length);
  const after = content.slice(endIdx);
  const body = bodyLines.length > 0 ? `\n${bodyLines.join('\n')}\n` : '\n';
  return before + body + after;
}

/** True when the hosts file already maps every hostname to `ip` (read-only check). */
export function hostsFileHasAllEntries(
  hostnames: string[],
  ip: string = '127.0.0.1',
  hostsPath: string = getHostsPath(),
): { complete: boolean; missing: string[]; readable: boolean } {
  const unique = [...new Set(hostnames.map((h) => h.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) {
    return { complete: true, missing: [], readable: true };
  }

  let content: string;
  try {
    if (!fs.existsSync(hostsPath)) {
      return { complete: false, missing: unique, readable: true };
    }
    content = normalizeLineEndings(fs.readFileSync(hostsPath, 'utf8'));
  } catch {
    return { complete: false, missing: unique, readable: false };
  }

  const missing = unique.filter((hostname) => !hostsLineHasMapping(content, ip, hostname));
  return { complete: missing.length === 0, missing, readable: true };
}

function hostsLineHasMapping(content: string, ip: string, hostname: string): boolean {
  const lineRe = new RegExp(
    `^\\s*${escapeRegex(ip)}\\s+${escapeRegex(hostname)}(?:\\s|$)`,
    'im',
  );
  return lineRe.test(content);
}

/** Rewrite the devmgr hosts block in one pass (faster than many hosts:add calls). */
export function hostsSync(
  hostnames: string[],
  ip: string = '127.0.0.1',
  hostsPath: string = getHostsPath(),
): { synced: number; ip: string } {
  const unique = [...new Set(hostnames.map((h) => h.trim()).filter(Boolean))];
  let content = fs.existsSync(hostsPath)
    ? normalizeLineEndings(fs.readFileSync(hostsPath, 'utf8'))
    : '';

  for (const hostname of unique) {
    content = stripHostnameLines(content, hostname);
  }
  content = ensureMarkerBlock(content);
  const lines = unique.map((hostname) => `${ip} ${hostname}`);
  content = replaceMarkerBlockBody(content, lines);
  fs.writeFileSync(hostsPath, content.replace(/\n/g, '\r\n'), 'utf8');

  return { synced: unique.length, ip };
}
