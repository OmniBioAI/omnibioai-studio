# Contributing to OmniBioAI Studio

Thank you for your interest in contributing. This guide reflects the actual architecture of the Electron desktop application — read it before writing code.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Repository layout](#repository-layout)
- [Architecture overview](#architecture-overview)
- [IPC contract (main ↔ renderer)](#ipc-contract-main--renderer)
- [Dev workflow](#dev-workflow)
- [Adding a new IPC handler](#adding-a-new-ipc-handler)
- [Frontend (React/Vite)](#frontend-reactvite)
- [Building for release](#building-for-release)
- [Code quality](#code-quality)
- [PR checklist](#pr-checklist)

---

## Code of conduct

Be respectful, constructive, and professional. Harassment or dismissive communication will not be tolerated. Assume good faith.

---

## Getting started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Docker & Docker Compose | 24+ (for full-stack dev) |
| Git | any recent |

### Install

```bash
git clone https://github.com/man4ish/omnibioai-studio
cd omnibioai-studio
npm install
```

### Copy the env template

```bash
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY, OPENAI_API_KEY, cloud credentials as needed
```

### Run in development mode

```bash
npm run dev
```

This concurrently starts the Vite dev server on `http://localhost:5174` and launches Electron with `OMNIBIOAI_DEV_MODE=true`. In dev mode:

- Electron loads `http://localhost:5174` (not the packaged `dist/index.html`)
- Docker lifecycle IPC calls are stubbed — they return `{ devMode: true }` immediately
- CSP is fully removed from response headers
- The license server points to `http://localhost:8099` (local mock)

To run just the Vite frontend without Electron:

```bash
npm run vite          # dev server
npm run web:build     # static build only
npm run web:preview   # preview the static build
```

---

## Repository layout

```
omnibioai-studio/
├── electron/
│   ├── main.js          ← Main process: IPC handlers, Docker, config, license
│   └── preload.js       ← Context bridge — exposes window.api and window.electronAPI
├── backend/
│   ├── config.js        ← Config read/write to userData/omnibioai.config.json
│   └── license_server.py← Local license server (dev only)
├── src/                 ← React + Vite frontend (renderer process)
├── index.html           ← Vite entry point
├── vite.config.ts / postcss.config.js / tailwind (via postcss)
├── electron-builder.json← electron-builder packaging config
├── docker-compose.yml   ← Dev compose file (loaded in dev mode)
├── docker-compose.release.yml ← Packaged app compose file
├── build/               ← App icons (icon.png, .ico, .icns)
├── db-init/             ← SQL init scripts (copied into userData on first run)
├── monitoring/          ← Prometheus + Grafana config
└── .github/workflows/
    └── release.yml      ← GitHub Actions release pipeline
```

Runtime-generated directories (`dist/`, `release/`, `out/`) are gitignored.

---

## Architecture overview

OmniBioAI Studio is a standard Electron app — two isolated JS contexts:

```
Renderer process (React/Vite)
    window.api.*           ← safe IPC calls via contextBridge
    window.electronAPI.*   ← license IPC
         │
         │  ipcRenderer.invoke(channel, ...args)
         ▼
Main process (electron/main.js)
    ipcMain.handle(channel, handler)
    ├── Config: save/load/reset → backend/config.js → userData/omnibioai.config.json
    ├── Docker: start/stop/restart → docker compose -f <compose-file>
    ├── Health: check-health → docker ps --format {{.Names}}
    ├── Service restart: restart-service → whitelist enforced (ALLOWED_SERVICES)
    ├── License: validate/cache/clear → LICENSE_SERVER + userData/license.json
    └── Log streaming: startLogStream → docker logs -f (workbench, tes, toolserver, celery)
```

**Config** is stored in `userData/omnibioai.config.json` (Electron's per-user app data dir — platform-specific). On `save-config`, an `.env` file is also written to `userData/.env` and passed to `docker compose --env-file`.

**Compose file selection:**
- Dev (`app.isPackaged === false`): `docker-compose.yml` at repo root
- Release (packaged): `docker-compose.release.yml` from `process.resourcesPath`

---

## IPC contract (main ↔ renderer)

`preload.js` exposes two globals. **Never** bypass `contextBridge` — do not use `nodeIntegration: true`.

### `window.api`

| Method | IPC channel | Description |
|---|---|---|
| `saveConfig(config)` | `save-config` | Writes config JSON + regenerates `.env` |
| `loadConfig()` | `load-config` | Reads `omnibioai.config.json` |
| `resetConfig()` | `reset-config` | Deletes config + `.env` |
| `startDocker()` | `start-docker` | `docker compose pull` then `up -d` |
| `stopDocker()` | `stop-docker` | `docker compose down` |
| `restartDocker()` | `restart-docker` | `docker compose restart` |
| `restartService(name)` | `restart-service` | Restart one service (whitelist enforced) |
| `checkHealth()` | `check-health` | Returns `{mysql, redis, workbench, tes, …}` booleans |
| `onDockerLog(cb)` | `docker-log` event | Streams compose pull/up output lines |
| `streamLogs(cb)` | `log-stream` event | Streams live container log output |
| `openWorkbench()` | `open-workbench` | Opens `http://localhost:8000` in system browser |
| `openExternal(url)` | `open-external` | Opens any HTTPS URL in system browser |
| `loadUrl(url)` | `load-url` | Navigates main window to a URL |
| `goHome()` | `go-home` | Navigates main window back to app home |

### `window.electronAPI`

| Method | IPC channel | Description |
|---|---|---|
| `validateLicense(key)` | `license-validate` | POSTs to license server, caches result |
| `getLicense()` | `license-get-cached` | Returns cached `userData/license.json` |
| `clearLicense()` | `license-clear` | Deletes `userData/license.json` |

The **allowed services** for `restart-service` are defined in `ALLOWED_SERVICES` in `main.js`. Add new service names there if you add Docker services.

---

## Dev workflow

### Changing the main process

Edit `electron/main.js`. Changes require restarting Electron — kill the dev process and run `npm run dev` again. The Vite HMR does not reload the main process.

### Changing the renderer (React)

Edit files under `src/`. Vite's HMR reloads the renderer automatically while Electron is running.

### Changing `preload.js`

Any new IPC method must be added to **both** `preload.js` (the `contextBridge.exposeInMainWorld` call) and `main.js` (the `ipcMain.handle` handler). Restart Electron after changes.

### Changing config structure

The config object is stored as plain JSON in `userData/omnibioai.config.json`. The `writeEnvFile` function in `main.js` maps config fields to `.env` variables for Docker Compose — update this function when adding new config keys that services need.

### Environment variables in the packaged app

User-facing secrets (API keys, cloud credentials) live in the config file, not in the system environment. `writeEnvFile` translates config → `.env` at save time. Never hardcode secrets in source.

---

## Adding a new IPC handler

1. Add a handler in `electron/main.js`:

```js
ipcMain.handle("my-new-channel", async (_, arg1, arg2) => {
  // implementation
  return result;
});
```

2. Expose it in `electron/preload.js`:

```js
contextBridge.exposeInMainWorld("api", {
  // ...existing methods...
  myNewMethod: (arg1, arg2) => ipcRenderer.invoke("my-new-channel", arg1, arg2),
});
```

3. Use it in React:

```js
const result = await window.api.myNewMethod(arg1, arg2);
```

4. In dev mode, stub it if it wraps Docker or system calls that don't apply:

```js
ipcMain.handle("my-new-channel", async () => {
  if (DEV_MODE) return DEV_RESPONSE;
  // ...real implementation
});
```

---

## Frontend (React/Vite)

The renderer is a standard React 18 + Vite 5 app. State management is via Zustand. Styling is Tailwind CSS (via PostCSS). The app imports `@man4ish/design-tokens` and `@man4ish/ui` from GitHub Packages.

### Installing GitHub Packages dependencies

The `.npmrc` in the repo root configures the `@man4ish` scope to resolve from `npm.pkg.github.com`. You need a personal access token with `read:packages` scope:

```bash
# ~/.npmrc  (user-level, not committed)
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Then `npm install` picks up `@man4ish/ui` and `@man4ish/design-tokens` normally.

### Vite config

The Vite config (`vite.config.ts` at repo root) serves the app from port `5174`. Do not change this port — `electron/main.js` hardcodes `http://localhost:5174` as the dev URL.

---

## Building for release

```bash
# Linux (arm64)
npm run build:linux

# macOS
npm run build:mac

# Windows
npm run build:win

# All platforms
npm run build:all
```

Each build command:
1. Sets `OMNIBIOAI_DEV_MODE=false`
2. Runs `vite build` → outputs to `dist/`
3. Runs `electron-builder` → outputs to `release/`

Packaging config is in `electron-builder.json`. The release pipeline (`.github/workflows/release.yml`) runs these commands in CI and publishes artifacts to GitHub Releases.

---

## Code quality

- **JavaScript:** no formatter is enforced yet — match the style of the file you're editing (2-space indent, single quotes in most places)
- **React:** functional components only; no class components
- **IPC:** every new `ipcMain.handle` must have a corresponding `contextBridge` exposure — never call `ipcRenderer` directly from renderer code
- **Security:** external URLs must be opened with `shell.openExternal` — never `loadURL` an HTTPS URL into the main window
- **Paths:** use `app.getPath('userData')` for user data, `process.resourcesPath` for bundled resources — never hardcode absolute paths

---

## PR checklist

- [ ] New IPC channels added to both `main.js` and `preload.js`
- [ ] Dev mode stub added for any Docker or system call that doesn't apply in dev
- [ ] Config keys that need to flow to Docker services added to `writeEnvFile`
- [ ] New allowed service names added to `ALLOWED_SERVICES` if applicable
- [ ] External URLs opened with `shell.openExternal`, not `loadURL`
- [ ] No hardcoded absolute paths — use `app.getPath()` or `process.resourcesPath`
- [ ] `npm run vite` (or `npm run dev`) tested locally before submitting
- [ ] Links to the issue: `Closes #<issue-number>`

---

## Questions

Open a GitHub Discussion or tag `@man4ish` in the relevant issue.
