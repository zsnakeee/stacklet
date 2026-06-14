# Stacklet

> **Early development** — Stacklet is under active development (v0.11.0).
> Expect bugs, incomplete features, and breaking changes.
> Use at your own risk; not recommended for critical machines yet.

[![CI](https://github.com/zsnakeee/stacklet/actions/workflows/ci.yml/badge.svg)](https://github.com/zsnakeee/stacklet/actions/workflows/ci.yml)

**Your local stack, one place.**

Stacklet is a Windows desktop app for PHP/Laravel developers: nginx **or Apache**, multiple PHP versions, MySQL/MariaDB, PostgreSQL, Redis, MongoDB, Mailpit, Node.js, Python, phpMyAdmin, `.test` sites with trusted local HTTPS, and PATH sync.

## Screenshots

**Dashboard**

<img src="art/dashboard.png" alt="Stacklet dashboard" width="920" />

**Sites**

<img src="art/sites.png" alt="Stacklet sites" width="920" />

**Services**

<img src="art/services.png" alt="Stacklet services" width="920" />

## Status

- **Windows only** (for now)
- **Early preview** — feedback and [issue reports](https://github.com/zsnakeee/stacklet/issues) are welcome

## Install

Download the latest **`Stacklet-Setup-x.y.z.exe`** from the
[releases page](https://github.com/ker00sama-dev/stacklet/releases/latest) and run it.

Stacklet **auto-updates**: once installed, it checks GitHub for new releases and installs
them silently in place (Settings → Updates lets you check/download manually). On first
launch it offers to **import your projects from Laragon** or start fresh.

## Requirements

- Windows 10/11
- Node.js 22+
- npm

## Features

**UI**
- Modern React UI (Vite + Tailwind) with **light/dark theme**, collapsible sidebar, dashboard, sites, services, logs, Mailpit inbox, and settings — runs in the tray.
- **Multi-language** interface (English + Arabic) with automatic **RTL** layout and a bundled Arabic font (fully offline); themed dropdowns; a **global progress bar** for every action.
- **Herd-style tray menu** — app shortcuts, start/stop services with live status, PHP-version switch, open config files, settings/updates/quit.
- **Auto-update** via GitHub Releases (silent in-place install) and a **first-run** "import from Laragon / start fresh" prompt.

**Web servers & PHP**
- **nginx _or_ Apache** — install both and switch in Settings (PHP served via FastCGI on both).
- Multiple PHP versions; set a global default **or isolate a specific version per site** (herd-`isolate`-style — a dedicated php-cgi per isolated version).
- **Xdebug on-demand** — XDEBUG-triggered requests are routed to an Xdebug-enabled PHP; everything else stays fast.
- Per-service quick settings (php.ini, my.ini, nginx tuning), **searchable** PHP extensions, a **PECL installer** (redis, mongodb, imagick, swoole, …), and **IonCube Loader**.
- **Per-site nginx URL rewrites** — Laravel/WordPress/SPA/static templates + custom directives, and open the generated config.

**Services**
- Bundled nginx, Apache, PHP, MySQL/MariaDB, PostgreSQL, Redis, **MongoDB**, **Mailpit**, Node.js, **Python**, phpMyAdmin — install/start/stop/switch versions.
- **Editable service ports** (Settings → Ports) for every service.
- **Redis** settings (password, max memory, eviction policy, AOF) and **Mailpit** local mail catcher (SMTP `127.0.0.1:1025` + an in-app web inbox, with a how-to guide).
- **Composer** one-click install (uses your active PHP).

**Sites**
- New Laravel app via `composer create-project` (with live progress), link an existing folder (served in place), or clone from Git.
- **Migrate from Laragon** — bulk-import projects as sites and copy enabled PHP extensions (Settings → Migrate from Laragon; separate root + projects paths).
- Auto-detect Laravel (`artisan`) and serve `public/` as docroot; **editable document root**.
- `*.test` hostnames with local HTTPS via a trusted CA; **configurable TLD**; a manageable **default site** for `http://127.0.0.1/` (dashboard or a chosen project).
- Per-site actions: open in Explorer, **terminal** (with optional Cmder/Clink autocomplete), **Tinker**, run artisan, **share online via ngrok** (auto-installed, HTTPS, auto-configures Laravel TrustProxies).

**Node.js**
- Multiple Node versions through Services, plus **nvm-windows integration** — list/install/switch Node versions from Settings.
- **Per-project `.nvmrc`** (or `.node-version`): a site's pinned Node is put on PATH automatically in its terminal/Tinker session, and shown on the site page.

**System**
- PATH sync for terminal access to bundled tools (php, composer, node, python, mongod…).
- **Movable data directory** (or point at an existing one) and **customizable projects folder**.
- Startup options: start minimized, **keep running in tray on close** (or exit), autostart services, launch at Windows login.
- All-service logs in the Logs tab (nginx/apache/php/mysql/redis/mongodb/mailpit) + PHP `error_log`.
- Branded app + tray icon; global error logging to `…\stacklet\logs\app.log`.

## How Stacklet compares

A feature overview against other popular local PHP stacks. Each tool has a different focus,
so this is a best-effort snapshot (mid-2026) — corrections via [issues](https://github.com/zsnakeee/stacklet/issues) are welcome.

| Feature | **Stacklet** | Laravel Herd | Laragon | AppServ | XAMPP |
|---|:---:|:---:|:---:|:---:|:---:|
| Platform | Windows | macOS, Windows | Windows | Windows | Win / macOS / Linux |
| Price / license | Free · MIT | Free + paid Pro | Free | Free | Free |
| Web server | nginx **+** Apache | nginx | Apache + nginx | Apache | Apache |
| Multiple PHP versions | ✅ | ✅ | ✅ | ❌ | ❌ |
| Per-site PHP isolation | ✅ | ✅ | 🟡 | ❌ | ❌ |
| Auto `.test` domains | ✅ | ✅ | ✅ | ❌ | ❌ |
| Trusted local HTTPS | ✅ | ✅ | ✅ | ❌ | 🟡 manual |
| MySQL / MariaDB | ✅ | 💲 Pro | ✅ | ✅ | ✅ |
| PostgreSQL | ✅ | 💲 Pro | 🟡 | ❌ | ❌ |
| Redis | ✅ | 💲 Pro | 🟡 | ❌ | ❌ |
| MongoDB | ✅ | ❌ | 🟡 | ❌ | ❌ |
| Mail catcher (Mailpit) | ✅ | 💲 Pro | ❌ | ❌ | 🟡 Mercury |
| Node.js | ✅ | 🟡 | ✅ | ❌ | ❌ |
| nvm + per-project `.nvmrc` | ✅ | ❌ | ❌ | ❌ | ❌ |
| Python | ✅ | ❌ | 🟡 | ❌ | ❌ |
| Composer / Laravel scaffolding | ✅ | ✅ | ✅ | ❌ | ❌ |
| Light / dark UI | ✅ | ✅ | 🟡 | ❌ | ❌ |
| Multi-language UI (+ RTL) | ✅ | ❌ | 🟡 | ❌ | ❌ |
| Import from Laragon | ✅ | ❌ | — | ❌ | ❌ |
| Auto-update | ✅ | ✅ | 🟡 | ❌ | ❌ |
| Open source | ✅ | ❌ | 🟡 | ✅ | ✅ |

<sub>✅ built-in · 🟡 partial / via add-on · ❌ not available · 💲 paid tier</sub>

## Quick start

```bash
git clone https://github.com/zsnakeee/stacklet.git
cd stacklet
npm install
npm start
```

> Launch with `npm start` (builds, then runs under Electron). `npm run dev` is **not** a launch path.

Run tests:

```bash
npm test
```

## CLI

After building, a CLI is available via npm script:

```bash
npm run devmgr -- status
npm run devmgr -- sites
npm run devmgr -- sites-new myapp
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Build + launch the Electron app |
| `npm run build` | Compile TypeScript (main) + build the Vite renderer |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | TypeScript check (main + renderer) without emit |
| `npm run icon` | Regenerate the app icon (`build/icon.png` + `.ico`) |
| `npm run pack` | Unpacked Windows app in `release/` |
| `npm run dist` | NSIS installer |

> Packaging (`pack`/`dist`) downloads `winCodeSign`, which contains symlinks. On Windows this needs **Developer Mode** enabled (Settings → Privacy & security → For developers) or an **elevated** terminal — otherwise extraction fails with "Cannot create symbolic link".

## Data & projects directories

- Runtime data lives under `%LOCALAPPDATA%\stacklet` (auto-migrated from the older `\devmgr` folder). It can be **moved** from Settings → Paths, or overridden with `STACKLET_DATA_DIR`.
- New projects are created in `…\stacklet\projects` by default — **customizable** from Settings → Paths.

## Reporting issues

Found a bug or have a feature request? [Open an issue](https://github.com/zsnakeee/stacklet/issues).

Please include your Windows version, Stacklet version, and steps to reproduce.

## License

[MIT](LICENSE)
