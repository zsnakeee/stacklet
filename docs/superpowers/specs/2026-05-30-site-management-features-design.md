# Site Management Features — Design

**Date:** 2026-05-30
**Branch:** phase-0-spike
**Scope:** Six site/project features for dev-mgr (Category A).

## Goal

Add six site-level capabilities to the Sites experience:

1. **Per-site PHP version** (#1) — each site picks its PHP version; lazy php-cgi pool.
2. **Quick-toggle** (#4) — enable/disable a site without removing it.
3. **Git clone** (#5) — create a new site by cloning a repository URL.
4. **Custom domain / aliases** (#6) — override the derived `.test` hostname and add aliases.
5. **Favorites + search** (#7) — pin sites and filter the list.
6. **Copy URL / open HTTPS** (#8) — quick clipboard + browser actions.

Out of scope this round: open-in-editor (#2), more project types (#3).

## Current State (verified)

- **Manifest:** `getSitesManifestPath()` stores a JSON array of `{ name, root }` only (`sites-registry.ts`). Loader filters entries to those two string fields.
- **Site type** (`config/types.ts`): `{ name, hostname, root, doc_root, framework }`. Hostname is *derived* from `name` via `siteHostnameFromDirName`.
- **nginx render** (`render/nginx.ts`): every site `server` block hardcodes `fastcgi_pass 127.0.0.1:9000` and a single `server_name`.
- **PHP runtime:** `ServiceManager` spawns one `php-cgi.exe -b 127.0.0.1:9000` (`PHP_FASTCGI_PORT`, `services/php-cgi.ts`, `services/index.ts`). One process, one version.
- **Hosts:** `Orchestrator.collectHostsHostnames()` gathers `site.hostname` + phpMyAdmin.
- **TLS SAN:** `collectTlsSanNames(config, sites)` already dynamic per hostname (regenerates certs). Needs alias inclusion.
- **Apply flow:** `apply()` → `applyLocalConfigs()` → `renderAll(config, sites)` + `reloadNginx`. Site mutations call `refreshSites()` then `apply()` then `provisionSiteHostsAndSsl()`.

## Architecture

### 1. Richer site manifest (foundation for #4–#8 and #1 storage)

Extend the persisted record (backward compatible — all new fields optional):

```ts
interface RegisteredSite {
  name: string;
  root: string;
  php?: string;        // PHP version override; undefined = global default
  domain?: string;     // primary hostname override; undefined = derived .test
  aliases?: string[];  // extra server_names
  enabled?: boolean;   // undefined/true = served; false = skipped
  favorite?: boolean;  // undefined/false = normal; true = pinned
}
```

- **New module `engine/site-config.ts`**: `updateRegisteredSite(name, patch)` for partial updates; validation (hostname uniqueness across name+domain+aliases, DNS-safe, php installed). Migration is implicit: missing fields read as defaults. The existing loader's type guard is relaxed to keep optional fields.
- **`Site` type** gains: `php?: string`, `enabled: boolean`, `favorite: boolean`, `aliases: string[]`. `hostname` continues to be the *effective* primary (domain override or derived). `registeredToSite()` resolves effective values and defaults.
- **Effective hostname helper**: `domain?.trim()` if set and valid, else `siteHostnameFromDirName(name)`.

### 2. nginx render changes (`render/nginx.ts`)

- `serverBlock(site, config, ..., phpPort)` — accept the resolved FastCGI port; emit `fastcgi_pass 127.0.0.1:${phpPort}`.
- `server_name` lists effective hostname + all aliases (each passed through `nginxServerName`).
- `renderNginxVhosts(config, sites, phpPortMap)` — skip sites where `enabled === false`; look up each site's port from `phpPortMap` (version → port), defaulting to the global default version's port.

### 3. Per-site PHP — lazy php-cgi pool (#1)

**New component `engine/services/php-pool.ts`** (or fold into ServiceManager):

- Input: the set of **PHP versions in use** = `{ default version } ∪ { site.php for each enabled site that overrides }`, restricted to versions installed on disk.
- **Port assignment** (deterministic): default version → `PHP_FASTCGI_PORT` (9000). Other in-use versions → `9001, 9002, …` assigned by sorted version order so a given set always maps the same way. Exposed as `phpPortMap: Map<version, port>`.
- **Lifecycle:** the pool reconciles against the desired version set — start a `ManagedProcess` (built via `buildPhpCgiSpawn` against that version's `php-cgi.exe`) for each needed version on its port; stop processes for versions no longer used. Each version's binary is resolved from `getPhpInstallPath(version)`.
- **Apply integration:** `apply()`/`applyLocalConfigs()` computes the desired version set + `phpPortMap`, passes the map to `renderAll`/`renderNginxVhosts`, then reconciles the pool (so nginx and the running processes agree), then `reloadNginx`.
- **Start/stop/status:** `start()`/`stop()` operate over all pool members. Dashboard "PHP" row reflects pool state (running if the default-port process runs; detail can list extra workers). `restartPhp()` restarts the whole pool.
- **Edge cases:** a site requesting an uninstalled PHP version falls back to the default version with a surfaced warning (it is not silently broken). Disabling/removing the last site on a non-default version stops that worker on next apply.

**Rationale (lazy vs full pool):** typical setups use 1–2 PHP versions; lazy spawns only what is referenced, minimizing RAM and start time, matching Herd/Laragon behavior. Deterministic port mapping keeps nginx config stable across applies.

### 4. Orchestrator wiring

- `collectHostsHostnames()` — include each enabled site's effective hostname + aliases; skip disabled sites.
- `collectTlsSanNames()` — include aliases.
- New orchestrator methods: `setSitePhp(name, version)`, `setSiteEnabled(name, enabled)`, `setSiteDomain(name, domain, aliases)`, `setSiteFavorite(name, favorite)`, `cloneGitSite(url, name?)`. Each mutates the manifest via `site-config.ts`, `refreshSites()`, `apply()`, and (when hostnames change or a site is added/enabled) `provisionSiteHostsAndSsl()`.
- `getSites()` ordering: favorites first, then alphabetical.

### 5. Git clone (#5)

- **New site-action `cloneGitProject(projectsDir, url, name?)`** in `site-actions.ts`: derive a safe folder name from `name` or the repo basename; reject if the target exists; run `git clone <url> <name>` (reuse the `runCommand` spawn pattern); return the resolved root. Framework auto-detected by `registeredToSite`.
- Orchestrator `cloneGitSite` registers + applies + provisions like `linkExistingSite`.
- Surfaces clone failures (bad URL, git missing) as errors to the toast/alert path.

### 6. Renderer / UI (`renderer/app.js`, `index.html`, `styles/app.css`)

- **Sites toolbar:** add "Clone from Git" button + a **search input** that filters `renderSites()` output client-side (matches name/hostname/framework).
- **Site card:** favorite (star) toggle, disabled state styling (dimmed + "Disabled" tag), copy-URL + open-HTTPS icon buttons. Favorites render first.
- **Clone modal:** mirrors the existing Laravel/link modals — URL field + optional name.
- **Site detail page:** new "Configuration" section —
  - PHP version `<select>` (installed versions; "Default (x.y)" option) → `setSitePhp`.
  - Enabled toggle → `setSiteEnabled`.
  - Domain field + aliases (comma-separated) with Save → `setSiteDomain`; show a hint that saving re-syncs hosts (may UAC).
  - Favorite toggle.
  - Copy URL / Open HTTPS actions.
- **IPC:** new channels in `preload.ts` + main bridge for each orchestrator method, following the existing `window.devmgr.site.*` / `sitesActions.*` shape.

### 7. Tests (vitest)

Follow existing `__tests__` patterns:

- `site-config` — manifest migration (old `{name,root}` reads with defaults), partial update, hostname/alias uniqueness + DNS-safety validation, php-installed validation.
- `php-pool` — version-set derivation from sites+default; deterministic port assignment; reconcile add/remove; uninstalled-version fallback.
- `render/nginx` (extend) — per-site `fastcgi_pass` from port map; multiple `server_name`; disabled sites omitted.
- `site-actions` — `cloneGitProject` name derivation + existing-folder rejection (mock spawn).

## Data Flow (per-site PHP, end to end)

```
User sets site-c → PHP 8.2 (detail page select)
  → IPC setSitePhp("site-c","8.2")
  → site-config.updateRegisteredSite (manifest)
  → refreshSites()  (Site.php = "8.2")
  → apply():
      desired versions = {default 8.3, 8.2}
      phpPortMap = {8.3:9000, 8.2:9001}
      renderNginxVhosts(..., phpPortMap)  // site-c block → fastcgi_pass :9001
      pool.reconcile({8.3,8.2})           // spawn php-cgi 8.2 on :9001
      reloadNginx
  → provisionSiteHostsAndSsl() (only if hostnames changed; here no)
```

## Error Handling

- Manifest validation errors (duplicate hostname, bad domain, uninstalled PHP) throw before persistence; surfaced to UI.
- Uninstalled per-site PHP at apply time → fall back to default port + non-fatal warning in `status().warnings`.
- Git clone failures → error surfaced; no partial registration (register only after clone succeeds).
- Pool worker spawn failure for a non-default version → that site falls back to default; warning surfaced; other sites unaffected.
- Disabled sites excluded from hosts/SAN/nginx — no cert or host entry churn for them.

## Risks / Trade-offs

- **Pool is the main architectural change.** ServiceManager currently models one `phpFpm`. The pool generalizes this; dashboard/status code referencing `phpFpm` must route through the pool's default-port member to avoid regressions.
- **Port range** 9000+ must avoid collisions with other services (mysql/postgres/redis use their own configured ports; FastCGI range is PHP-only). Cap the lazy pool to a sane max (e.g., versions in use) — unbounded only by installed-version count.
- **Hosts/UAC churn:** domain/alias edits change hostnames → may trigger `provisionSiteHostsAndSsl` (UAC). Detail UI must warn before save.

## Implementation Order (for the plan)

1. Manifest schema + `site-config.ts` + `Site` type + migration + tests.
2. nginx render: port map + multi server_name + disabled skip + tests.
3. php-pool + ServiceManager/orchestrator apply integration + tests.
4. Orchestrator site-mutation methods + hosts/SAN inclusion of aliases.
5. Git clone site-action + orchestrator + tests.
6. IPC channels (preload + bridge).
7. Renderer: Sites toolbar/search/clone modal/card actions; detail Configuration section.
8. Smoothness pass on new UI (reuse existing motion tokens).
```
