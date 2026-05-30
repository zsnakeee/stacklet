# Site Management Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five site-level features to dev-mgr — quick enable/disable, git clone, custom domain/aliases, favorites+search, and copy-URL/open-HTTPS.

**Architecture:** Extend the bare `{name, root}` sites manifest with optional fields (`domain`, `aliases`, `enabled`, `favorite`), resolved into the `Site` shape on load. nginx render and TLS/hosts collection honor effective hostnames + the enabled flag. A new `site-config.ts` owns validation + partial updates; orchestrator gains mutation methods exposed over IPC; the renderer gets toolbar search, a clone modal, richer site cards, and a detail "Configuration" panel. Per-site PHP is intentionally out of scope (separate spec).

**Tech Stack:** TypeScript, Electron (main/preload/renderer), nginx config generation, node-forge TLS, vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-site-management-features-design.md`

---

## File Structure

- `src/config/types.ts` — `Site` gains optional `enabled`, `favorite`, `aliases`.
- `src/engine/sites-registry.ts` — `RegisteredSite` gains optional fields; `registeredToSite` resolves effective values; favorites sort.
- `src/engine/sites.ts` — `effectiveHostname()` helper.
- `src/engine/site-config.ts` — **new** — hostname validation, alias normalization, uniqueness check, `updateRegisteredSite`.
- `src/engine/render/nginx.ts` — multi `server_name`, skip disabled sites.
- `src/engine/tls.ts` — SAN includes aliases, skips disabled.
- `src/engine/site-actions.ts` — `cloneGitProject`, `repoNameFromUrl`.
- `src/engine/site-commands.ts` — `getSiteDetail` exposes `defaultHostname`.
- `src/engine/orchestrator.ts` — `setSiteEnabled/Favorite/Domain`, `cloneGitSite`; hosts/SAN alias inclusion.
- `src/main/preload.ts` + `src/main/engine-bridge.ts` — IPC channels.
- `src/renderer/index.html` / `app.js` / `icons.js` / `styles/app.css` — UI.
- Tests: `src/engine/__tests__/site-config.test.ts`, `src/engine/render/__tests__/nginx.test.ts` (extend), `src/engine/__tests__/site-actions.test.ts`, `src/engine/__tests__/tls-san.test.ts`.

---

## Task 1: Site + manifest schema (foundation)

**Files:**
- Modify: `src/config/types.ts` (Site interface, ~line 79)
- Modify: `src/engine/sites.ts` (add `effectiveHostname`)
- Modify: `src/engine/sites-registry.ts` (`RegisteredSite`, `registeredToSite`, `loadSitesFromRegistry`)

- [ ] **Step 1: Extend the `Site` type**

In `src/config/types.ts`, replace the `Site` interface:

```ts
export interface Site {
  name: string;
  hostname: string;
  root: string;
  doc_root: string;
  framework: 'laravel' | 'wordpress' | 'generic';
  /** Defaults to true when absent. */
  enabled?: boolean;
  /** Defaults to false when absent. */
  favorite?: boolean;
  /** Extra server_names beyond the primary hostname. */
  aliases?: string[];
}
```

- [ ] **Step 2: Add `effectiveHostname` to `sites.ts`**

In `src/engine/sites.ts`, after `siteHostnameFromDirName` (~line 39), add:

```ts
/** Primary hostname for a site: custom domain override, else derived from name. */
export function effectiveHostname(record: { name: string; domain?: string }): string {
  const custom = record.domain?.trim().toLowerCase();
  if (custom) return custom;
  return siteHostnameFromDirName(record.name);
}
```

- [ ] **Step 3: Extend `RegisteredSite` and resolution in `sites-registry.ts`**

In `src/engine/sites-registry.ts`:

Replace the `RegisteredSite` interface (~line 7):

```ts
export interface RegisteredSite {
  name: string;
  root: string;
  domain?: string;
  aliases?: string[];
  enabled?: boolean;
  favorite?: boolean;
}
```

Update the import line (~line 5) to include `effectiveHostname`:

```ts
import { detectFramework, effectiveHostname, resolveDocRoot, siteHostnameFromDirName } from './sites';
```

Replace `registeredToSite` (~line 42):

```ts
function normalizeAliasList(aliases: unknown): string[] {
  if (!Array.isArray(aliases)) return [];
  const out: string[] = [];
  for (const a of aliases) {
    if (typeof a !== 'string') continue;
    const h = a.trim().toLowerCase();
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

export function registeredToSite(record: RegisteredSite): Site | null {
  const root = path.resolve(record.root);
  if (!fs.existsSync(root)) return null;
  const framework = detectFramework(root);
  return {
    name: record.name,
    hostname: effectiveHostname(record),
    root,
    doc_root: resolveDocRoot(root, framework),
    framework,
    enabled: record.enabled !== false,
    favorite: record.favorite === true,
    aliases: normalizeAliasList(record.aliases),
  };
}
```

Replace the sort in `loadSitesFromRegistry` (~line 61) so favorites come first:

```ts
  return sites.sort((a, b) => {
    const fa = a.favorite ? 1 : 0;
    const fb = b.favorite ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return a.name.localeCompare(b.name);
  });
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). The loader's existing type guard already preserves extra fields, so old `{name,root}` manifests keep working.

- [ ] **Step 5: Commit**

```bash
git add src/config/types.ts src/engine/sites.ts src/engine/sites-registry.ts
git commit -m "feat: extend site manifest with domain/aliases/enabled/favorite"
```

---

## Task 2: site-config.ts validation + updates (TDD)

**Files:**
- Create: `src/engine/site-config.ts`
- Test: `src/engine/__tests__/site-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/__tests__/site-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertHostnamesAvailable,
  mergeSitePatch,
  normalizeAliases,
  recordHostnames,
  validateHostname,
} from '../site-config';
import type { RegisteredSite } from '../sites-registry';

describe('validateHostname', () => {
  it('lowercases and accepts valid hostnames', () => {
    expect(validateHostname('Shop.Test')).toBe('shop.test');
    expect(validateHostname('www.my-app.test')).toBe('www.my-app.test');
  });
  it('rejects empty and malformed hostnames', () => {
    expect(() => validateHostname('   ')).toThrow();
    expect(() => validateHostname('bad host')).toThrow();
    expect(() => validateHostname('-bad.test')).toThrow();
    expect(() => validateHostname('bad_.test')).toThrow();
  });
});

describe('normalizeAliases', () => {
  it('trims, lowercases, dedupes, drops empties', () => {
    expect(normalizeAliases([' A.test ', 'a.test', '', 'B.test'])).toEqual([
      'a.test',
      'b.test',
    ]);
  });
  it('returns [] for undefined', () => {
    expect(normalizeAliases(undefined)).toEqual([]);
  });
});

describe('recordHostnames', () => {
  it('combines effective hostname and aliases', () => {
    const rec: RegisteredSite = {
      name: 'myapp',
      root: '/x',
      aliases: ['www.myapp.test'],
    };
    expect(recordHostnames(rec)).toEqual(['myapp.test', 'www.myapp.test']);
  });
  it('uses custom domain as the primary', () => {
    const rec: RegisteredSite = { name: 'myapp', root: '/x', domain: 'shop.test' };
    expect(recordHostnames(rec)).toEqual(['shop.test']);
  });
});

describe('assertHostnamesAvailable', () => {
  const records: RegisteredSite[] = [
    { name: 'a', root: '/a' }, // a.test
    { name: 'b', root: '/b', domain: 'shop.test', aliases: ['www.shop.test'] },
  ];
  it('throws when a hostname belongs to another site', () => {
    expect(() => assertHostnamesAvailable(records, 'a', ['shop.test'])).toThrow(
      /already used by site "b"/,
    );
  });
  it('ignores the site itself', () => {
    expect(() => assertHostnamesAvailable(records, 'b', ['shop.test'])).not.toThrow();
  });
  it('allows free hostnames', () => {
    expect(() => assertHostnamesAvailable(records, 'a', ['a.test'])).not.toThrow();
  });
});

describe('mergeSitePatch', () => {
  const base: RegisteredSite = { name: 'a', root: '/a' };
  it('sets and clears a custom domain', () => {
    expect(mergeSitePatch(base, { domain: 'Shop.test' }).domain).toBe('shop.test');
    expect(mergeSitePatch({ ...base, domain: 'shop.test' }, { domain: '' }).domain).toBeUndefined();
  });
  it('normalizes aliases and validates them', () => {
    expect(mergeSitePatch(base, { aliases: ['WWW.a.test'] }).aliases).toEqual(['www.a.test']);
    expect(() => mergeSitePatch(base, { aliases: ['bad host'] })).toThrow();
  });
  it('sets booleans', () => {
    expect(mergeSitePatch(base, { enabled: false }).enabled).toBe(false);
    expect(mergeSitePatch(base, { favorite: true }).favorite).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/site-config.test.ts`
Expected: FAIL — cannot find module `../site-config`.

- [ ] **Step 3: Implement `site-config.ts`**

Create `src/engine/site-config.ts`:

```ts
import { loadRegisteredSites, saveRegisteredSites, type RegisteredSite } from './sites-registry';
import { effectiveHostname } from './sites';

export interface SitePatch {
  domain?: string | null;
  aliases?: string[];
  enabled?: boolean;
  favorite?: boolean;
}

const LABEL = '[a-z0-9]([a-z0-9-]*[a-z0-9])?';
const HOSTNAME_RE = new RegExp(`^${LABEL}(\\.${LABEL})*$`);

export function normalizeHostname(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateHostname(raw: string): string {
  const h = normalizeHostname(raw);
  if (!h) throw new Error('Hostname cannot be empty');
  if (h.length > 253) throw new Error(`Hostname too long: ${raw}`);
  if (!HOSTNAME_RE.test(h)) throw new Error(`Invalid hostname: ${raw}`);
  return h;
}

export function normalizeAliases(aliases?: string[]): string[] {
  if (!aliases) return [];
  const out: string[] = [];
  for (const a of aliases) {
    const h = normalizeHostname(a);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

/** Primary hostname plus all aliases for a record. */
export function recordHostnames(record: RegisteredSite): string[] {
  return [effectiveHostname(record), ...normalizeAliases(record.aliases)];
}

/** Throw if any candidate hostname already belongs to a different site. */
export function assertHostnamesAvailable(
  records: RegisteredSite[],
  selfName: string,
  candidate: string[],
): void {
  const taken = new Map<string, string>();
  for (const r of records) {
    if (r.name === selfName) continue;
    for (const h of recordHostnames(r)) taken.set(h, r.name);
  }
  for (const h of candidate) {
    const owner = taken.get(h);
    if (owner) throw new Error(`Hostname ${h} is already used by site "${owner}"`);
  }
}

/** Pure merge of a patch into a record, validating hostnames. */
export function mergeSitePatch(record: RegisteredSite, patch: SitePatch): RegisteredSite {
  const next: RegisteredSite = { ...record };
  if (patch.domain !== undefined) {
    if (patch.domain === null || patch.domain.trim() === '') {
      delete next.domain;
    } else {
      next.domain = validateHostname(patch.domain);
    }
  }
  if (patch.aliases !== undefined) {
    const norm = normalizeAliases(patch.aliases);
    norm.forEach((a) => validateHostname(a));
    next.aliases = norm;
  }
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.favorite !== undefined) next.favorite = patch.favorite;
  return next;
}

/** Load, patch, validate uniqueness, and persist a single site. */
export function updateRegisteredSite(name: string, patch: SitePatch): RegisteredSite {
  const records = loadRegisteredSites();
  const idx = records.findIndex((r) => r.name === name);
  if (idx === -1) throw new Error(`Site not found: ${name}`);
  const updated = mergeSitePatch(records[idx], patch);
  assertHostnamesAvailable(records, name, recordHostnames(updated));
  records[idx] = updated;
  saveRegisteredSites(records);
  return updated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/site-config.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/engine/site-config.ts src/engine/__tests__/site-config.test.ts
git commit -m "feat: site-config validation and partial updates"
```

---

## Task 3: nginx render — aliases + disabled (TDD)

**Files:**
- Modify: `src/engine/render/nginx.ts`
- Test: `src/engine/render/__tests__/nginx.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Open `src/engine/render/__tests__/nginx.test.ts`. The file already imports `defaultConfig` from `'../../../config/defaults'`, `Site` from `'../../../config/types'`, and `renderNginxVhosts` from `'../nginx'`. Add these two cases inside the existing `describe('renderNginxVhosts', ...)` block (after the last `it`, before the closing `});`):

```ts
  it('emits primary hostname and aliases as server_name', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'shop',
        hostname: 'shop.test',
        root: 'C:/sites/shop',
        doc_root: 'C:/sites/shop/public',
        framework: 'laravel',
        enabled: true,
        aliases: ['www.shop.test'],
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).toContain('server_name shop.test www.shop.test;');
  });

  it('omits disabled sites', () => {
    const config = defaultConfig();
    const sites: Site[] = [
      {
        name: 'off',
        hostname: 'off.test',
        root: 'C:/sites/off',
        doc_root: 'C:/sites/off',
        framework: 'generic',
        enabled: false,
      },
    ];
    const conf = renderNginxVhosts(config, sites);
    expect(conf).not.toContain('off.test');
    expect(conf).toContain('No registered sites');
  });
```

> Note: existing fixtures in this file omit the new optional `Site` fields — that still compiles because `enabled`/`favorite`/`aliases` are optional. The "omits disabled sites" case relies on `renderNginxVhosts` returning the `# No registered sites` body when every site is filtered out (`defaultConfig()` has phpMyAdmin enabled but with an empty `path`, so its vhost block is skipped).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/render/__tests__/nginx.test.ts`
Expected: FAIL — current render emits only the single hostname and includes disabled sites.

- [ ] **Step 3: Implement render changes**

In `src/engine/render/nginx.ts`:

Add a helper above `serverBlock` (~line 37):

```ts
function serverNames(site: Site): string {
  const names = [site.hostname, ...(site.aliases ?? [])].filter(Boolean);
  return names.map(nginxServerName).join(' ');
}
```

In `serverBlock`, replace the `server_name` line:

```ts
  server_name ${serverNames(site)};
```

In `renderNginxVhosts` (~line 120), filter disabled sites before mapping:

```ts
  const activeSites = sites.filter((s) => s.enabled !== false);
  blocks.push(...activeSites.map((s) => serverBlock(s, config, sslCert, leafKey)));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/render/__tests__/nginx.test.ts`
Expected: PASS (new + existing cases).

- [ ] **Step 5: Commit**

```bash
git add src/engine/render/nginx.ts src/engine/render/__tests__/nginx.test.ts
git commit -m "feat: nginx render honors aliases and disabled sites"
```

---

## Task 4: TLS SAN + hosts include aliases (TDD)

**Files:**
- Modify: `src/engine/tls.ts` (`collectTlsSanNames`, ~line 35)
- Modify: `src/engine/orchestrator.ts` (`collectHostsHostnames`, ~line 235)
- Test: `src/engine/__tests__/tls-san.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/__tests__/tls-san.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { collectTlsSanNames } from '../tls';
import type { DevConfig, Site } from '../../config/types';

const config = {
  services: { phpmyadmin: { enabled: false, hostname: '', path: '' } },
} as unknown as DevConfig;

const site = (over: Partial<Site>): Site => ({
  name: 'a',
  hostname: 'a.test',
  root: '/a',
  doc_root: '/a',
  framework: 'generic',
  enabled: true,
  ...over,
});

describe('collectTlsSanNames', () => {
  it('always includes wildcard and apex', () => {
    expect(collectTlsSanNames(config, [])).toEqual(['*.test', 'test']);
  });
  it('includes site hostname and aliases', () => {
    const names = collectTlsSanNames(config, [site({ aliases: ['www.a.test'] })]);
    expect(names).toContain('a.test');
    expect(names).toContain('www.a.test');
  });
  it('excludes disabled sites', () => {
    const names = collectTlsSanNames(config, [site({ name: 'off', hostname: 'off.test', enabled: false })]);
    expect(names).not.toContain('off.test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/tls-san.test.ts`
Expected: FAIL — aliases not added; disabled sites still included.

- [ ] **Step 3: Implement SAN change**

In `src/engine/tls.ts`, replace the site loop in `collectTlsSanNames` (~lines 37-39):

```ts
  for (const site of sites) {
    if (site.enabled === false) continue;
    if (site.hostname) names.add(site.hostname.trim().toLowerCase());
    for (const alias of site.aliases ?? []) {
      const h = alias.trim().toLowerCase();
      if (h) names.add(h);
    }
  }
```

- [ ] **Step 4: Implement hosts change**

In `src/engine/orchestrator.ts`, replace the site loop in `collectHostsHostnames` (~lines 237-239):

```ts
    for (const site of this.sites) {
      if (site.enabled === false) continue;
      if (site.hostname) names.add(site.hostname.trim().toLowerCase());
      for (const alias of site.aliases ?? []) {
        const h = alias.trim().toLowerCase();
        if (h) names.add(h);
      }
    }
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/engine/__tests__/tls-san.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/tls.ts src/engine/orchestrator.ts src/engine/__tests__/tls-san.test.ts
git commit -m "feat: aliases in TLS SAN and hosts; skip disabled sites"
```

---

## Task 5: Git clone site-action (TDD)

**Files:**
- Modify: `src/engine/site-actions.ts`
- Test: `src/engine/__tests__/site-actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/__tests__/site-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cloneGitProject, repoNameFromUrl } from '../site-actions';

describe('repoNameFromUrl', () => {
  it('derives the repo name from common URL forms', () => {
    expect(repoNameFromUrl('https://github.com/user/repo.git')).toBe('repo');
    expect(repoNameFromUrl('git@github.com:user/repo.git')).toBe('repo');
    expect(repoNameFromUrl('https://github.com/user/repo')).toBe('repo');
    expect(repoNameFromUrl('https://example.com/a/b/my-app/')).toBe('my-app');
  });
});

describe('cloneGitProject', () => {
  it('rejects an empty URL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-'));
    await expect(cloneGitProject(dir, '   ')).rejects.toThrow(/URL is required/);
  });
  it('rejects when the target folder already exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-'));
    fs.mkdirSync(path.join(dir, 'repo'));
    await expect(
      cloneGitProject(dir, 'https://github.com/user/repo.git'),
    ).rejects.toThrow(/already exists/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/site-actions.test.ts`
Expected: FAIL — `cloneGitProject` / `repoNameFromUrl` not exported.

- [ ] **Step 3: Implement clone action**

In `src/engine/site-actions.ts`, append:

```ts
/** Repo folder name from a git URL (strips .git, trailing slash, path/host). */
export function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const lastSeg = cleaned.split(/[/:]/).pop() ?? '';
  return lastSeg;
}

/** Clone a repository into projectsDir and return its registration tuple. */
export async function cloneGitProject(
  projectsDir: string,
  url: string,
  projectName?: string,
): Promise<{ name: string; root: string }> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) throw new Error('Repository URL is required');

  const derived = projectName?.trim() || repoNameFromUrl(trimmedUrl);
  const safeName = derived.replace(/[^\w.-]/g, '');
  if (!safeName) throw new Error('Could not determine a project name from the URL');

  const target = path.join(projectsDir, safeName);
  if (fs.existsSync(target)) {
    throw new Error(`Folder already exists: ${target}`);
  }

  fs.mkdirSync(projectsDir, { recursive: true });
  await runCommand('git', ['clone', trimmedUrl, safeName], projectsDir);
  return { name: safeName, root: target };
}
```

> `runCommand`, `fs`, and `path` are already imported at the top of `site-actions.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/site-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/site-actions.ts src/engine/__tests__/site-actions.test.ts
git commit -m "feat: cloneGitProject site action"
```

---

## Task 6: Orchestrator site mutation methods

**Files:**
- Modify: `src/engine/orchestrator.ts`
- Modify: `src/engine/site-commands.ts` (`getSiteDetail`)

- [ ] **Step 1: Add imports**

In `src/engine/orchestrator.ts`, update the site-actions import (~line 64):

```ts
import { cloneGitProject, createLaravelProject, resolveExistingProjectPath } from './site-actions';
```

Add a new import near the registry import (~line 65-69):

```ts
import { updateRegisteredSite } from './site-config';
```

- [ ] **Step 2: Add mutation methods**

In `src/engine/orchestrator.ts`, after `removeSite` (~line 595), add:

```ts
  async setSiteEnabled(name: string, enabled: boolean): Promise<Site[]> {
    updateRegisteredSite(name, { enabled });
    this.refreshSites();
    await this.apply();
    if (enabled) await this.provisionSiteHostsAndSsl();
    return this.getSites();
  }

  async setSiteFavorite(name: string, favorite: boolean): Promise<Site[]> {
    updateRegisteredSite(name, { favorite });
    this.refreshSites();
    return this.getSites();
  }

  async setSiteDomain(
    name: string,
    domain: string | null,
    aliases: string[],
  ): Promise<Site[]> {
    updateRegisteredSite(name, { domain, aliases });
    this.refreshSites();
    await this.apply();
    await this.provisionSiteHostsAndSsl();
    return this.getSites();
  }

  async cloneGitSite(url: string, name?: string): Promise<Site[]> {
    const { name: siteName, root } = await cloneGitProject(getProjectsDir(), url, name);
    addRegisteredSite(siteName, root);
    this.refreshSites();
    await this.apply();
    await this.provisionSiteHostsAndSsl();
    return this.getSites();
  }
```

> `getProjectsDir` and `addRegisteredSite` are already imported in this file.

- [ ] **Step 3: Expose `defaultHostname` in site detail**

In `src/engine/site-commands.ts`:

Update the import (~line 6) to add `siteHostnameFromDirName`:

```ts
import { findLaravelLogPaths, siteHostnameFromDirName } from './sites';
```

In `getSiteDetail` (~line 25), add `defaultHostname` to the returned object:

```ts
  return {
    ...site,
    url: `https://${site.hostname}`,
    defaultHostname: siteHostnameFromDirName(site.name),
    laravelLogId: site.framework === 'laravel' ? resolveLaravelLogId(site) : null,
    laravelLogPath: laravelLogs[0] ?? null,
    hasArtisan: exists(path.join(site.root, 'artisan')),
    envPath: exists(path.join(site.root, '.env')) ? path.join(site.root, '.env') : null,
  };
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/orchestrator.ts src/engine/site-commands.ts
git commit -m "feat: orchestrator site mutation methods + detail defaultHostname"
```

---

## Task 7: IPC channels

**Files:**
- Modify: `src/main/preload.ts`
- Modify: `src/main/engine-bridge.ts`

- [ ] **Step 1: Extend the preload API type**

In `src/main/preload.ts`, in the `sitesActions` block of `DevmgrAPI` (~lines 65-69), add four signatures:

```ts
  sitesActions: {
    createLaravel: (name: string) => Promise<unknown>;
    linkExisting: (sourcePath: string, projectName?: string) => Promise<unknown>;
    remove: (name: string) => Promise<unknown>;
    cloneGit: (url: string, name?: string) => Promise<unknown>;
    setEnabled: (name: string, enabled: boolean) => Promise<unknown>;
    setFavorite: (name: string, favorite: boolean) => Promise<unknown>;
    setDomain: (name: string, domain: string | null, aliases: string[]) => Promise<unknown>;
  };
```

- [ ] **Step 2: Extend the preload implementation**

In the `devmgrAPI` object's `sitesActions` (~lines 172-177), add the implementations:

```ts
  sitesActions: {
    createLaravel: (name) => ipcRenderer.invoke('devmgr:sites:createLaravel', name),
    linkExisting: (sourcePath, projectName) =>
      ipcRenderer.invoke('devmgr:sites:linkExisting', sourcePath, projectName),
    remove: (name) => ipcRenderer.invoke('devmgr:sites:remove', name),
    cloneGit: (url, name) => ipcRenderer.invoke('devmgr:sites:cloneGit', url, name),
    setEnabled: (name, enabled) =>
      ipcRenderer.invoke('devmgr:sites:setEnabled', name, enabled),
    setFavorite: (name, favorite) =>
      ipcRenderer.invoke('devmgr:sites:setFavorite', name, favorite),
    setDomain: (name, domain, aliases) =>
      ipcRenderer.invoke('devmgr:sites:setDomain', name, domain, aliases),
  },
```

- [ ] **Step 3: Add main-process handlers**

In `src/main/engine-bridge.ts`, after the `devmgr:sites:linkExisting` handler (~line 197), add:

```ts
  ipcMain.handle('devmgr:sites:cloneGit', async (_e, url: string, name?: string) => {
    const sites = await getEngine().cloneGitSite(url, name);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('devmgr:sites:setEnabled', async (_e, name: string, enabled: boolean) => {
    const sites = await getEngine().setSiteEnabled(name, enabled);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle('devmgr:sites:setFavorite', async (_e, name: string, favorite: boolean) => {
    const sites = await getEngine().setSiteFavorite(name, favorite);
    return { sites, status: await getEngine().status() };
  });
  ipcMain.handle(
    'devmgr:sites:setDomain',
    async (_e, name: string, domain: string | null, aliases: string[]) => {
      const sites = await getEngine().setSiteDomain(name, domain, aliases ?? []);
      return { sites, status: await getEngine().status() };
    },
  );
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/preload.ts src/main/engine-bridge.ts
git commit -m "feat: IPC channels for site clone/enable/favorite/domain"
```

---

## Task 8: Renderer — icons, toolbar, clone modal, cards, detail panel

**Files:**
- Modify: `src/renderer/icons.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add icons**

In `src/renderer/icons.js`, add three entries inside the `ICONS` object (before the closing `};` at ~line 12):

```js
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starFilled: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
```

- [ ] **Step 2: Toolbar + clone modal in `index.html`**

In `src/renderer/index.html`, replace the `sites-toolbar` div (~lines 75-78):

```html
            <div class="sites-toolbar">
              <button type="button" class="btn btn--primary" id="btn-new-laravel">New Laravel project</button>
              <button type="button" class="btn btn--ghost" id="btn-link-project">Add existing project</button>
              <button type="button" class="btn btn--ghost" id="btn-clone-git">Clone from Git</button>
              <input type="search" id="site-search" class="site-search" placeholder="Search sites…" aria-label="Search sites" />
            </div>
```

After the `modal-link` dialog (~line 162, before `<script ...>`), add:

```html
    <dialog class="modal" id="modal-clone">
      <form method="dialog" class="modal__box" id="form-clone">
        <h3>Clone from Git</h3>
        <label class="field">
          <span>Repository URL</span>
          <input type="text" name="url" required placeholder="https://github.com/user/repo.git" autocomplete="off" />
        </label>
        <label class="field">
          <span>Folder name (optional)</span>
          <input type="text" name="name" placeholder="defaults to repo name" autocomplete="off" />
        </label>
        <p class="modal__hint">Runs git clone into %LOCALAPPDATA%\devmgr\projects.</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn--primary">Clone</button>
        </div>
      </form>
    </dialog>
```

- [ ] **Step 3: Add module state + helpers in `app.js`**

In `src/renderer/app.js`, add a module-level variable near the other `let` declarations (~line 47):

```js
let siteSearchQuery = '';
```

Add a clipboard helper near `escapeHtml` (~after line 325):

```js
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function siteMatchesQuery(site, q) {
  if (!q) return true;
  return `${site.name} ${site.hostname} ${site.framework}`.toLowerCase().includes(q);
}
```

- [ ] **Step 4: Replace `renderSites`**

In `src/renderer/app.js`, replace the entire `renderSites` function (~lines 1184-1228) with:

```js
function renderSites() {
  const sites = state.status?.sites ?? [];
  const q = siteSearchQuery.trim().toLowerCase();
  const visible = sites.filter((s) => siteMatchesQuery(s, q));
  siteListEl.innerHTML = '';

  if (sites.length === 0) {
    siteListEl.innerHTML =
      '<li class="empty">No projects yet. Create a Laravel app, clone from Git, or add an existing project.</li>';
    return;
  }
  if (visible.length === 0) {
    siteListEl.innerHTML = `<li class="empty">No sites match “${escapeHtml(siteSearchQuery)}”.</li>`;
    return;
  }

  for (const site of visible) {
    const li = document.createElement('li');
    li.className = `site-card${site.enabled === false ? ' is-disabled' : ''}`;
    const detailHref = `#/sites/${encodeURIComponent(site.name)}`;
    const url = `https://${site.hostname}`;
    const favIcon = site.favorite ? ICONS.starFilled : ICONS.star;
    li.innerHTML = `
      <a href="${detailHref}" class="site-card__link">
        <div class="site-card__main">
          <span class="site-card__host">${escapeHtml(site.hostname)}</span>
          <span class="site-card__fw">${escapeHtml(site.framework)}</span>
        </div>
        <p class="site-card__path">${escapeHtml(site.doc_root)}</p>
      </a>
      ${site.enabled === false ? '<span class="site-card__tag">Disabled</span>' : ''}
      <div class="site-card__actions">
        <button type="button" class="btn btn--icon site-fav${site.favorite ? ' is-favorite' : ''}" title="${site.favorite ? 'Unfavorite' : 'Favorite'}" aria-label="Favorite" aria-pressed="${site.favorite ? 'true' : 'false'}">${favIcon}</button>
        <button type="button" class="btn btn--icon site-copy" title="Copy URL" aria-label="Copy URL">${ICONS.copy}</button>
        <button type="button" class="btn btn--icon site-open" title="Open HTTPS" aria-label="Open HTTPS"${site.enabled === false ? ' disabled' : ''}>${ICONS.external}</button>
        <button type="button" class="btn btn--ghost btn--sm site-remove">Remove</button>
      </div>
    `;

    li.querySelector('.site-fav')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await window.devmgr.sitesActions.setFavorite(site.name, !site.favorite);
        await refresh();
      } catch (err) {
        alert(err?.message ?? String(err));
      }
    });

    li.querySelector('.site-copy')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      const ok = await copyText(url);
      btn.title = ok ? 'Copied!' : 'Copy failed';
      btn.classList.toggle('is-copied', ok);
      setTimeout(() => {
        btn.title = 'Copy URL';
        btn.classList.remove('is-copied');
      }, 1200);
    });

    li.querySelector('.site-open')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await openInExternalBrowser(url);
      } catch (err) {
        alert(err?.message ?? String(err));
      }
    });

    li.querySelector('.site-remove')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        !confirm(
          `Remove "${site.name}" from dev-mgr? Your project files on disk are not deleted.`,
        )
      ) {
        return;
      }
      try {
        await window.devmgr.sitesActions.remove(site.name);
        if (detailSiteName === site.name) go('/sites');
        await refresh();
      } catch (err) {
        alert(err.message ?? String(err));
      }
    });

    siteListEl.appendChild(li);
  }
}
```

- [ ] **Step 5: Append a Configuration section in `renderSiteDetail`**

In `src/renderer/app.js`, inside `renderSiteDetail`, locate the assignment `siteDetailRootEl.innerHTML = \`...\`;` that ends with the `</section>` for `site-detail` (~line 1290). Immediately after that template's closing backtick+semicolon, append the configuration section by concatenation. Replace the line:

```js
  const root = siteDetailRootEl;
```

with:

```js
  siteDetailRootEl.innerHTML += `
    <section class="detail-section site-config">
      <h3>Configuration</h3>
      <label class="settings-toggle">
        <input type="checkbox" id="site-enabled"${detail.enabled === false ? '' : ' checked'} />
        <span>Enabled (served by nginx and hosts file)</span>
      </label>
      <label class="settings-toggle">
        <input type="checkbox" id="site-favorite"${detail.favorite ? ' checked' : ''} />
        <span>Favorite (pinned to the top of the list)</span>
      </label>
      <form class="site-domain-form" id="site-domain-form">
        <label class="field">
          <span>Primary domain</span>
          <input type="text" name="domain" value="${escapeAttr(detail.hostname)}" placeholder="${escapeAttr(detail.defaultHostname)}" autocomplete="off" />
        </label>
        <label class="field">
          <span>Aliases (comma-separated)</span>
          <input type="text" name="aliases" value="${escapeAttr((detail.aliases ?? []).join(', '))}" placeholder="www.example.test, example.test" autocomplete="off" />
        </label>
        <div class="detail-actions">
          <button type="submit" class="btn btn--primary btn--sm">Save domain</button>
        </div>
        <p class="detail-hint">Saving updates the hosts file and certificate — Windows may prompt for permission.</p>
      </form>
      <p class="settings-status" id="site-config-status" hidden></p>
    </section>
  `;

  const root = siteDetailRootEl;
```

- [ ] **Step 6: Wire the Configuration controls**

In `renderSiteDetail`, after the existing `root.querySelector('.site-remove-detail')?.addEventListener(...)` block (~line 1326, end of function), add:

```js
  const showCfgStatus = (text, ok) => {
    const el = root.querySelector('#site-config-status');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = `settings-status ${ok ? 'settings-status--ok' : 'settings-status--err'}`;
  };

  root.querySelector('#site-enabled')?.addEventListener('change', async (e) => {
    try {
      await window.devmgr.sitesActions.setEnabled(siteName, e.target.checked);
      await refresh();
      showCfgStatus(e.target.checked ? 'Site enabled.' : 'Site disabled.', true);
    } catch (err) {
      showCfgStatus(err?.message ?? String(err), false);
    }
  });

  root.querySelector('#site-favorite')?.addEventListener('change', async (e) => {
    try {
      await window.devmgr.sitesActions.setFavorite(siteName, e.target.checked);
      await refresh();
    } catch (err) {
      showCfgStatus(err?.message ?? String(err), false);
    }
  });

  root.querySelector('#site-domain-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const rawDomain = String(data.get('domain') ?? '').trim();
    const domain =
      !rawDomain || rawDomain.toLowerCase() === detail.defaultHostname.toLowerCase()
        ? null
        : rawDomain;
    const aliases = String(data.get('aliases') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await window.devmgr.sitesActions.setDomain(siteName, domain, aliases);
      await refresh();
      await renderSiteDetail(siteName);
      showCfgStatus('Domain saved.', true);
    } catch (err) {
      showCfgStatus(err?.message ?? String(err), false);
    }
  });
```

- [ ] **Step 7: Wire toolbar search + clone modal + generalize data-close**

In `src/renderer/app.js`, replace the `data-close` handler block (~lines 2015-2020):

```js
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog')?.close());
});
```

After the `modalLink` declaration (~line 2002), add:

```js
const modalClone = document.getElementById('modal-clone');

const siteSearchEl = document.getElementById('site-search');
siteSearchEl?.addEventListener('input', () => {
  siteSearchQuery = siteSearchEl.value;
  if (parseRoute().page === 'sites') renderSites();
});

document.getElementById('btn-clone-git')?.addEventListener('click', () => {
  modalClone?.showModal();
});

document.getElementById('form-clone')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const url = String(data.get('url') ?? '').trim();
  const name = String(data.get('name') ?? '').trim();
  modalClone?.close();
  if (!url) return;
  try {
    await window.devmgr.sitesActions.cloneGit(url, name || undefined);
    await refresh();
    go('/sites');
  } catch (err) {
    alert(err.message ?? String(err));
  }
});
```

- [ ] **Step 8: Build + typecheck**

Run: `npm run build`
Expected: PASS — `tsc` clean and renderer copied. (Renderer JS is not type-checked but must be syntactically valid; the build copies it.)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/icons.js src/renderer/index.html src/renderer/app.js
git commit -m "feat: site cards with favorite/copy/open, search, clone modal, config panel"
```

---

## Task 9: Styling + smoothness pass

**Files:**
- Modify: `src/renderer/styles/app.css`

- [ ] **Step 1: Add new component styles**

In `src/renderer/styles/app.css`, after the `.sites-toolbar, .catalog-toolbar { ... }` block (~line 420), add:

```css
.site-search {
  margin-left: auto;
  font: inherit;
  font-size: 13px;
  padding: 0.4rem 0.6rem;
  min-width: 180px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.site-search:focus {
  outline: none;
  border-color: var(--color-primary);
}

.site-card__tag {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  border: 1px dashed var(--color-border);
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
}

.site-card.is-disabled {
  opacity: 0.55;
}

.site-fav.is-favorite {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 50%, transparent);
}

.site-fav:active:not(:disabled) svg {
  animation: star-pop 0.3s var(--ease-out);
}

.site-copy.is-copied {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.site-domain-form {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.75rem;
  max-width: 28rem;
}

.site-config .settings-toggle {
  margin-bottom: 0.5rem;
}

@keyframes star-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.35); }
  100% { transform: scale(1); }
}
```

- [ ] **Step 2: Upgrade site-card hover (smoothness)**

In `src/renderer/styles/app.css`, replace the existing motion-section `.site-card` + `.site-card:hover` block (~lines 1420-1426):

```css
.site-card {
  position: relative;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.site-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  transform: translateY(-1px);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--color-bg) 50%, #000 50%);
}

.site-grid .site-card {
  animation: card-in var(--duration-slow) var(--ease-out) both;
}
```

- [ ] **Step 3: Build and visually verify**

Run: `npm run build && npm start`
Expected: App launches. On **Sites**: search filters live; star toggles + pins to top; copy button flips to "Copied!"; open-HTTPS launches the browser; disabled sites dim with a "Disabled" tag. On a **site detail**: Configuration panel toggles enabled/favorite and saves domain/aliases. Cards animate in and lift on hover.

> If `npm start` is not available in the worker's environment, stop after `npm run build` and note that manual visual verification is pending.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/app.css
git commit -m "style: site card polish, search, favorite/disabled states, smoothness"
```

---

## Final Verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — all existing + new vitest suites green.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke (if app can launch)**

- Clone a small public repo → appears in Sites, served at `https://<repo>.test`.
- Disable a site → its vhost disappears after re-apply (check generated `devmgr-sites.conf`), hosts entry not required.
- Set a custom domain + alias → both resolve over HTTPS after hosts sync + cert regen.
- Favorite a site → sorts to top, persists across restart.

---

## Notes for the implementer

- **Manifest back-compat:** old `{name,root}` entries load with defaults (enabled=true, favorite=false, no domain/aliases). The loader keeps unknown fields because it returns the original objects.
- **No partial registration on clone:** `addRegisteredSite` runs only after `git clone` resolves.
- **UAC on domain edits:** changing hostnames triggers `provisionSiteHostsAndSsl` (may prompt). The detail panel warns before save.
- **Per-site PHP is deferred** — do not add a `php` field or php-cgi pool here.
```
