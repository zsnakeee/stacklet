# Stacklet

> **Early development** — Stacklet is under active development (v0.1.0).
> Expect bugs, incomplete features, and breaking changes.
> Use at your own risk; not recommended for critical machines yet.

[![CI](https://github.com/zsnakeee/stacklet/actions/workflows/ci.yml/badge.svg)](https://github.com/zsnakeee/stacklet/actions/workflows/ci.yml)

**Your local stack, one place.**

Stacklet is a Windows desktop app for Laravel developers: nginx, PHP, MySQL, Redis, PostgreSQL, `.test` sites, trusted local HTTPS, and PATH sync — Herd/Laragon-style without manual config.

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

## Requirements

- Windows 10/11
- Node.js 22+
- npm

## Features

- Electron tray app with dashboard, sites, services, logs, and settings
- Bundled nginx, PHP (multiple versions), MySQL, PostgreSQL, Redis, Node.js, phpMyAdmin
- Link existing project folders — nginx serves them in place (no copy)
- `composer create-project` for new Laravel apps
- Auto-detect Laravel (`artisan`) and serve `public/` as docroot
- `*.test` hostnames with local HTTPS via a trusted CA
- PATH sync for terminal access to bundled tools
- CLI for status, sites, and service control

## Quick start

```bash
git clone https://github.com/zsnakeee/stacklet.git
cd stacklet
npm install
npm start
```

Run tests:

```bash
npm test
```

## CLI

After building, the CLI is available via npm script (internal name unchanged for compatibility):

```bash
npm run devmgr -- status
npm run devmgr -- sites
npm run devmgr -- sites-new myapp
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Build + launch Electron UI |
| `npm run build` | Compile TypeScript + copy renderer |
| `npm test` | Run Vitest suite |
| `npm run typecheck` | TypeScript check without emit |
| `npm run pack` | Unpacked Windows app in `release/` |
| `npm run dist` | NSIS installer |

## Data directory

Config and runtime data live under `%LOCALAPPDATA%\devmgr` (internal path unchanged for compatibility with earlier builds).

## Reporting issues

Found a bug or have a feature request? [Open an issue](https://github.com/zsnakeee/stacklet/issues).

Please include your Windows version, Stacklet version, and steps to reproduce.

## License

[MIT](LICENSE)
