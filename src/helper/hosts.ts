import fs from 'fs';
import path from 'path';
import { BRAND, legacyHostsMarkers, readEnv } from '../shared/brand';

export const HOSTS_MARKER_BEGIN = BRAND.hostsMarkerBegin;
export const HOSTS_MARKER_END = BRAND.hostsMarkerEnd;

const LEGACY_MARKER_BEGIN = legacyHostsMarkers().begin;
const LEGACY_MARKER_END = legacyHostsMarkers().end;

/** System hosts file, overridable via STACKLET_HOSTS_PATH (or legacy DEVMGR_HOSTS_PATH). */
export function getHostsPath(): string {
  const override = readEnv('HOSTS_PATH');
  if (override) return override;
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'drivers', 'etc', 'hosts');
}

/** Remove a legacy hosts block (migration to the current marker). */
function stripLegacyBlock(content: string): string {
  const begin = content.indexOf(LEGACY_MARKER_BEGIN);
  if (begin === -1) return content;
  const end = content.indexOf(LEGACY_MARKER_END, begin);
  if (end === -1) return content;
  const before = content.slice(0, begin).replace(/\n+$/, '\n');
  const after = content.slice(end + LEGACY_MARKER_END.length).replace(/^\n+/, '\n');
  return before + after.replace(/^\n/, '');
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when a hosts line maps `hostname` to any IPv4 address. */
function hostnameLineMatches(line: string, hostname: string): boolean {
  const lineRe = new RegExp(
    `^\\s*(?:\\d{1,3}\\.){3}\\d{1,3}\\s+${escapeRegex(hostname)}(?:\\s+#.*)?\\s*$`,
  );
  return lineRe.test(line.replace(/\r$/, ''));
}

/**
 * Read the body lines inside the managed marker block. Returns null if absent.
 * Everything OUTSIDE this block is the user's data and is never touched.
 */
function getMarkerBlockBody(content: string): string[] | null {
  const beginIdx = content.indexOf(HOSTS_MARKER_BEGIN);
  if (beginIdx === -1) return null;
  const endIdx = content.indexOf(HOSTS_MARKER_END, beginIdx);
  if (endIdx === -1) return null;
  return content
    .slice(beginIdx + HOSTS_MARKER_BEGIN.length, endIdx)
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '');
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

  content = ensureMarkerBlock(content);
  const body = (getMarkerBlockBody(content) ?? []).filter(
    (line) => !hostnameLineMatches(line, hostname),
  );
  body.push(`${ip} ${hostname}`);
  content = replaceMarkerBlockBody(content, body);
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

  const body = getMarkerBlockBody(content);
  if (body) {
    content = replaceMarkerBlockBody(
      content,
      body.filter((line) => !hostnameLineMatches(line, hostname)),
    );
  }

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
    throw new Error(`${BRAND.name} hosts marker block is missing`);
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

/** Rewrite the managed hosts block in one pass (faster than many hosts:add calls). */
export function hostsSync(
  hostnames: string[],
  ip: string = '127.0.0.1',
  hostsPath: string = getHostsPath(),
): { synced: number; ip: string } {
  const unique = [...new Set(hostnames.map((h) => h.trim()).filter(Boolean))];
  let content = fs.existsSync(hostsPath)
    ? normalizeLineEndings(fs.readFileSync(hostsPath, 'utf8'))
    : '';

  content = stripLegacyBlock(content);
  content = ensureMarkerBlock(content);
  const lines = unique.map((hostname) => `${ip} ${hostname}`);
  content = replaceMarkerBlockBody(content, lines);
  fs.writeFileSync(hostsPath, content.replace(/\n/g, '\r\n'), 'utf8');

  return { synced: unique.length, ip };
}