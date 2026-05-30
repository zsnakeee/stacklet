# Site Management Features — Design

**Date:** 2026-05-30
**Branch:** phase-0-spike
**Scope:** Five site/project features for dev-mgr (Category A). Per-site PHP split out.

## Goal

Add five site-level capabilities to the Sites experience:

1. **Quick-toggle** (#4) — enable/disable a site without removing it.
2. **Git clone** (#5) — create a new site by cloning a repository URL.
3. **Custom domain / aliases** (#6) — override the derived `.test` hostname and add aliases.
4. **Favorites + search** (#7) — pin sites and filter the list.
5. **Copy URL / open HTTPS** (#8) — quick clipboard + browser actions.

**Deferred to its own spec:** per-site PHP version (#1). It requires generalizing the
single `ServiceManager.phpFpm` into a lazy php-cgi pool (Herd "isolation" model) — a
larger architectural change. This spec leaves a clean seam for it (manifest is
extensible; the effective-hostname/port plumbing it needs is noted but not built).
Out of scope entirely: open-in-editor (#2), more project types (#3).

## Current State (verified)

- **Manifest:** `getSitesManifestPath()` stores a JSON array of `{ name, root }` only (`sites-registry.ts`). Loader filters entries to those two string fields.
- **Site type** (`config/types.ts`): `{ name, hostname, root, doc_root, framework }`. Hostname is *derived* from `name` via `siteHostnameFromDirName`.
- **nginx render** (`render/nginx.ts`): every site `server` block emits a single `server_name` (effective hostname). `fastcgi_pass 127.0.0.1:9000` stays unchanged this round.
- **Hosts:** `Orchestrator.collectHostsHostnames()` gathers `site.hostname` + phpMyAdmin.
- **TLS SAN:** `collectTlsSanNames(config, sites)` already dynamic per hostname (regenerates certs). Needs alias inclusion.
- **Apply flow:** `apply()` → `applyLocalConfigs()` → `renderAll(config, sites)` + `reloadNginx`. Site mutations call `refreshSites()` then `apply()` then `provisionSiteHostsAndSsl()`.

## Architecture

### 1. Richer site manifest (foundation for all five)

Extend the persisted record (backward compatible — all new fields optional):

```ts
interface RegisteredSite {
  name: string;
  root: string;
  domain?: string;     // primary hostname override; undefined = derived .test
  aliases?: string[];  // extra server_names
  enabled?: boolean;   // undefined/true = served; false = skipped
  favorite?: boolean;  // undefined/false = normal; true = pinned
}
```

(A future `php?` field is reserved for the per-site PHP spec — not added here.)

- **New module `engine/site-config.ts`**: `updateRegisteredSite(name, patch)` for partial updates; validation (hostname uniqueness across name+domain+aliases, DNS-safe). Migration is implicit: missing fields read as defaults. The existing loader's type guard is relaxed to keep optional fields.
- **`Site` type** gains: `enabled: boolean`, `favorite: boolean`, `aliases: string[]`. `hostname` continues to be the *effective* primary (domain override or derived). `registeredToSite()` resolves effective values and defaults.
- **Effective hostname helper**: `domain?.trim()` if set and valid, else `siteHostnameFromDirName(name)`.

### 2. nginx render changes (`render/nginx.ts`)

- `server_name` lists effective hostname + all aliases (each passed through `nginxServerName`).
- `renderNginxVhosts(config, sites)` — skip sites where `enabled === false`.
- `fastcgi_pass` unchanged (single 9000) — per-site PHP spec will parametrize it later.

### 3. Orchestrator wiring

- `collectHostsHostnames()` — include each enabled site's effective hostname + aliases; skip disabled sites.
- `collectTlsSanNames()` — include aliases.
- New orchestrator methods: `setSiteEnabled(name, enabled)`, `setSiteDomain(name, domain, aliases)`, `setSiteFavorite(name, favorite)`, `cloneGitSite(url, name?)`. Each mutates the manifest via `site-config.ts`, `refreshSites()`, `apply()`, and (when hostnames change or a site is added/enabled) `provisionSiteHostsAndSsl()`.
- `getSites()` ordering: favorites first, then alphabetical.

### 4. Git clone (#5)

- **New site-action `cloneGitProject(projectsDir, url, name?)`** in `site-actions.ts`: derive a safe folder name from `name` or the repo basename; reject if the target exists; run `git clone <url> <name>` (reuse the `runCommand` spawn pattern); return the resolved root. Framework auto-detected by `registeredToSite`.
- Orchestrator `cloneGitSite` registers + applies + provisions like `linkExistingSite`.
- Surfaces clone failures (bad URL, git missing) as errors to the UI.

### 5. Renderer / UI (`renderer/app.js`, `index.html`, `styles/app.css`)

- **Sites toolbar:** add "Clone from Git" button + a **search input** that filters `renderSites()` output client-side (matches name/hostname/framework).
- **Site card:** favorite (star) toggle, disabled state styling (dimmed + "Disabled" tag), copy-URL + open-HTTPS icon buttons. Favorites render first.
- **Clone modal:** mirrors the existing Laravel/link modals — URL field + optional name.
- **Site detail page:** new "Configuration" section —
  - Enabled toggle → `setSiteEnabled`.
  - Domain field + aliases (comma-separated) with Save → `setSiteDomain`; hint that saving re-syncs hosts (may UAC).
  - Favorite toggle.
  - Copy URL / Open HTTPS actions.
- **IPC:** new channels in `preload.ts` + main bridge for each orchestrator method, following the existing `window.devmgr.site.*` / `sitesActions.*` shape.
- Reuse existing `icons.js` for star/copy/external icons (add any missing glyphs there).

### 6. Tests (vitest)

Follow existing `__tests__` patterns:

- `site-config` — manifest migration (old `{name,root}` reads with defaults), partial update, hostname/alias uniqueness + DNS-safety validation.
- `render/nginx` (extend) — multiple `server_name` (hostname + aliases); disabled sites omitted.
- `site-actions` — `cloneGitProject` name derivation + existing-folder rejection (mock spawn).

## Data Flow (custom domain, end to end)

```
User sets site-c domain = "shop.test", aliases = "www.shop.test" (detail page)
  → IPC setSiteDomain("site-c","shop.test",["www.shop.test"])
  → site-config.updateRegisteredSite (validate uniqueness/DNS-safe → manifest)
  → refreshSites()  (Site.hostname="shop.test", aliases=[...])
  → apply():
      collectTlsSanNames → regenerate certs incl. shop.test + www.shop.test
      renderNginxVhosts → server_name shop.test www.shop.test
      reloadNginx
  → provisionSiteHostsAndSsl()  (hostnames changed → hosts sync, may UAC)
```

## Error Handling

- Manifest validation errors (duplicate hostname/alias, bad domain) throw before persistence; surfaced to UI.
- Git clone failures (bad URL, git missing) → error surfaced; register only after clone succeeds (no partial registration).
- Disabled sites excluded from hosts/SAN/nginx — no cert or host entry churn for them.
- Toggling/removing never deletes project files on disk (existing behavior preserved).

## Risks / Trade-offs

- **Hosts/UAC churn:** domain/alias edits change hostnames → may trigger `provisionSiteHostsAndSsl` (UAC). Detail UI warns before save.
- **Manifest back-compat:** loader type guard must accept old `{name,root}` entries and not drop the new optional fields. Covered by a migration test.
- **Effective hostname collisions:** a custom `domain` could collide with another site's derived hostname; validation checks the full effective set (names + domains + aliases).

## Implementation Order (for the plan)

1. Manifest schema + `site-config.ts` + `Site` type + migration + tests.
2. nginx render: multi `server_name` + disabled skip + tests.
3. Orchestrator site-mutation methods + hosts/SAN inclusion of aliases.
4. Git clone site-action + orchestrator + tests.
5. IPC channels (preload + bridge).
6. Renderer: Sites toolbar/search/clone modal/card actions; detail Configuration section.
7. Smoothness pass on new UI (reuse existing motion tokens).

## Follow-up Spec (not this round)

**Per-site PHP version (#1)** — lazy php-cgi pool (default version + isolated sites,
one worker per version-in-use, deterministic ports 9000+, per-site `fastcgi_pass`).
Adds a `php?` manifest field and a `phpPortMap` threaded through nginx render and a
new `engine/services/php-pool.ts`, generalizing `ServiceManager.phpFpm`. Mirrors
Laravel Herd's isolation model. To be specced separately.
