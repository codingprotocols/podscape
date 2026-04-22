---
title: Development Guide
nav_order: 5
---

# Development Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | v20+ (v22 recommended) | |
| Go | v1.22+ | CGO must be enabled |
| C compiler | any | Required by CGO — `gcc` on Linux, Xcode CLT on macOS, MinGW on Windows |
| Trivy CLI | optional | For image vulnerability scanning in Security Hub |

Install Trivy (macOS):
```bash
brew install trivy
```

---

## Setup

```bash
# Install Node dependencies (also runs postinstall which rebuilds node-pty)
npm install

# Build the Go sidecar — required before first dev run
cd go-core && go build ./cmd/podscape-core/ && cd ..
```

---

## Development

```bash
npm run dev          # Start Electron + Vite dev server with hot reload
```

> **Note:** If `window.kubectl.*` methods appear as `undefined` at runtime, the preload build is stale. Restart `npm run dev`.

---

## Codebase Structure

### Renderer (`src/renderer/`)
- `components/core/`: High-level orchestration components (`Layout`, `SectionRouter`, `OverlayManager`, `ErrorBoundary`).
- `store/`: Zustand state management split into domain-specific slices.
- `types/`: Granular TypeScript definitions (`api.ts`, `k8s.ts`, `ui.ts`, `utils.ts`, `common.ts`).
- `config.ts`: Centralized UI configuration — `LIST_SECTIONS`, `CLUSTER_SCOPED_SECTIONS`, `PROVIDER_SECTIONS`, `SECTION_LABELS`, `COLUMNS` — all typed with `ResourceKind`. Adding a new section requires only updating this file and the appropriate dispatch map in `SectionRouter`.
- `utils/prefetch.ts`: Background eager-loads lazy panel chunks after mount; failures are logged as warnings rather than swallowed silently.

### Go Sidecar (`go-core/`)
- `internal/handlers/`: HTTP resource handlers and operation logic.
- `internal/k8sutil/`: Canonical Kubernetes resource metadata — `KindGVR`, `KindGVRFallback`, `ClusterScopedKinds`. This is the single source of truth for GVR resolution; `internal/ops` and `internal/handlers/operations.go` both delegate here. Adding a new resource type or alias requires only a change in this package.
- `internal/rbac/`: Core RBAC probing engine.


---

## Running Tests

```bash
# Frontend (Vitest)
npm run test
npm run test:watch   # watch mode

# Go sidecar (handlers, rbac, helm, portforward, prometheus, ownerchain)
cd go-core && go test ./...
```

---

## Building

The full build compiles the Go sidecar first, then runs electron-vite:

```bash
npm run build        # Go sidecar + renderer + main + preload
```

Individual steps:
```bash
cd go-core && go build ./cmd/podscape-core/   # sidecar binary only
cd go-core && go build ./cmd/podscape-mcp/    # MCP server binary only
npx electron-vite build                        # Electron assets only
```

---

## Distribution

Packages are produced by `electron-builder`. Artifacts land in `dist/`.

```bash
npm run build:mac    # macOS — .dmg + .zip (arm64 and x64 separately)
npm run build:win    # Windows — NSIS installer (.exe)
npm run build:linux  # Linux — AppImage + .deb
```

### Icon generation

Icons must be generated before packaging if they don't already exist:

```bash
npm run icon:icns    # macOS .icns from resources/icon.png
npm run icon:ico     # Windows .ico from resources/icon.png
```

Requirements: `imagemagick` (Linux/macOS) or the scripts handle it via `sips` on macOS.

---

## CI / Release

Releases are triggered by pushing a `v*` git tag. The workflow (`.github/workflows/release.yml`) runs three parallel jobs:

| Job | Runner | Output |
|---|---|---|
| `release-mac` (arm64) | `macos-latest` | `.dmg` + `.zip` for Apple Silicon |
| `release-mac` (x64) | `macos-13` | `.dmg` + `.zip` for Intel |
| `release-win` | `windows-latest` | `.exe` NSIS installer |
| `release-linux` | `ubuntu-latest` | `.AppImage` + `.deb` |

Each job also uploads a `checksums-<platform>.txt` file to the GitHub release so users can verify downloads with SHA256.

Required GitHub secret: `GH_TOKEN` with `contents: write` permission on the repository.

---

## Settings Schema

App settings are stored in `~/.podscape/settings.json`. The file is created automatically on first write. All fields are optional — missing keys fall back to the defaults shown below.

```json
{
  "kubeconfigPath": "",
  "shellPath": "",
  "theme": "dark",
  "prodContexts": [],
  "prometheusUrls": {},
  "costUrls": {},
  "tourCompleted": false,
  "pluginsEnabled": true,
  "finopsEnabled": true,
  "gitopsEnabled": true,
  "networkEnabled": true
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `kubeconfigPath` | `string` | `""` | Absolute path to a kubeconfig file. Empty string means use `$KUBECONFIG` env var, then `~/.kube/config`. |
| `shellPath` | `string` | `""` | Absolute path to the shell binary used for PTY terminals (e.g. `/bin/zsh`). Empty string means auto-detect from the user's environment. |
| `theme` | `"dark" \| "light" \| ""` | `"dark"` | UI colour theme. Empty string defers to the last-used or OS preference. |
| `prodContexts` | `string[]` | `[]` | List of kubeconfig context names to treat as production. Any matching context activates the red border + banner in the UI. |
| `prometheusUrls` | `Record<string, string>` | `{}` | Per-context manual Prometheus base URLs (e.g. `{ "my-ctx": "https://prometheus.example.com" }`). Empty string for a context means auto-discover via Kubernetes service proxy. |
| `costUrls` | `Record<string, string>` | `{}` | Per-context Kubecost / OpenCost base URLs. Empty string means auto-detect. |
| `tourCompleted` | `boolean` | `false` | Whether the post-connection onboarding tour has been shown and dismissed. |
| `pluginsEnabled` | `boolean` | `true` | Show the Plugins (Krew) panel in the sidebar. |
| `finopsEnabled` | `boolean` | `true` | Show the FinOps / Cost panel in the sidebar. |
| `gitopsEnabled` | `boolean` | `true` | Show the GitOps panel in the sidebar. |
| `networkEnabled` | `boolean` | `true` | Show the Network Map and Connectivity Tester panels in the sidebar. |

The settings file is read and written by `src/main/settings/settings_storage.ts` (`getSettings` / `saveSettings`). IPC handlers in `src/main/ipc/settings.ts` expose `settings:get` and `settings:set` channels to the renderer via `window.settings`.

---

## Auto-Updater

Podscape uses [`electron-updater`](https://www.electron.build/auto-update) to deliver in-app updates. The updater is configured in `src/main/system/updater.ts` and only activates in production builds (`is.dev` guard — no update checks during `npm run dev`).

**Update source**: `electron-updater` reads the `publish` configuration from `package.json` (GitHub releases). It fetches `latest.yml` / `latest-mac.yml` from the GitHub release assets to compare the current version against the latest published release.

**Behaviour**:
- `autoDownload` is set to `false` — updates are downloaded only when the user explicitly confirms.
- `autoInstallOnAppQuit` is `true` — a downloaded update is installed automatically the next time the app quits.
- An initial check fires 5 seconds after launch (delayed to avoid racing with sidecar startup). The timer is cancelled on `before-quit` to prevent a network request into a partially torn-down process.
- Events fired before the renderer window is ready are queued (up to 20) and flushed once `did-finish-load` fires, so no update notification is lost on a fast machine.

**IPC channels**:

| Channel | Direction | Description |
|---|---|---|
| `updater:check` | Renderer → Main (handle) | Trigger an immediate update check |
| `updater:download` | Renderer → Main (handle) | Start downloading the available update |
| `updater:install` | Renderer → Main (handle) | Quit and install the downloaded update |
| `updater:checking` | Main → Renderer (send) | Update check started |
| `updater:available` | Main → Renderer (send) | New version found; payload is the `UpdateInfo` object |
| `updater:not-available` | Main → Renderer (send) | Already on the latest version |
| `updater:progress` | Main → Renderer (send) | Download progress; payload is a `ProgressInfo` object |
| `updater:downloaded` | Main → Renderer (send) | Download complete; payload is the `UpdateDownloadedEvent` object |
| `updater:error` | Main → Renderer (send) | Error during check or download; payload is the error message string |

The `UpdateBanner` component in `src/renderer/components/core/UpdateBanner.tsx` listens for these events and renders an in-app notification bar when an update is available or has been downloaded.

**Testing updates locally**: `electron-updater` skips the update check entirely when `is.dev` is true, so local testing requires a production build. Point `autoUpdater.updateConfigPath` to a local `dev-app-update.yml` file or use `autoUpdater.forceDevUpdateConfig = true` with a matching release on a local file server.

---

## Known Build Notes

- **Native module rebuild**: `npm install` runs `electron-builder install-app-deps` via `postinstall`, which rebuilds any native modules for the target Electron version.
- **CGO on Windows**: MinGW must be on `PATH` before building the Go sidecar. The CI workflow adds it via `$env:PATH`.
- **Sidecar location**: In dev, the binary is expected at `go-core/podscape-core`. In production, electron-builder copies it to `resources/bin/podscape-core` via `extraResources`.
- **Stale preload**: If `window.kubectl.*` (or `window.krew.*`) methods appear as `undefined` at runtime, the preload build is stale. Restart `npm run dev` to pick up the latest preload.

---

## Kubectl Plugin Development

The Plugin Panel (`src/renderer/components/plugins/`) uses a registry-driven architecture. Each plugin is a self-contained module with an `InfoPanel` and a `RunPanel`.

### File layout

```
src/renderer/components/plugins/
  <plugin-name>/
    InfoPanel.tsx      # Info tab — description, install/uninstall button
    RunPanel.tsx       # Run tab — inputs + live output
  PluginContract.ts    # Shared prop types (PluginRunPanelProps, PluginInfoPanelProps)
  PluginInfoLayout.tsx # Reusable wrapper for InfoPanel with install/uninstall logic
  pluginRegistry.ts    # Lazy-load map: name → () => import('./name')
  usePluginRun.ts      # Hook: run plugin, stream output lines, track running state
  NamespaceSelect.tsx  # Dropdown backed by live cluster namespaces from the store
```

Plugin metadata (name, description, category, homepage) lives in `src/renderer/config/krewPlugins.json`.

### Key hooks and components

**`usePluginRun()`** — call `run(pluginName, args)` to invoke `kubectl <plugin> <args>`. Returns `{ lines, running, exitCode, run }`. Lines are pre-split by newline with `[stderr]` prefix on stderr. Leading whitespace is preserved (important for YAML/tree output).

**`PluginInfoLayout`** — pass `plugin`, `onInstall`, `onUninstall`, and `onOpen` props. Handles loading state, error display, and the install/uninstall button rendering.

**`NamespaceSelect`** — reads `namespaces` from the Zustand store and renders a live dropdown. Falls back to a plain text input when no namespaces are loaded yet. Accepts `includeAll` prop to add an "all namespaces" option.

### Adding a plugin

1. Add an entry to `src/renderer/config/krewPlugins.json`.
2. Create `src/renderer/components/plugins/<name>/InfoPanel.tsx` — use `PluginInfoLayout` as the wrapper.
3. Create `src/renderer/components/plugins/<name>/RunPanel.tsx` — use `usePluginRun` to invoke and stream output.
4. Register the loader in `src/renderer/components/plugins/pluginRegistry.ts`.

See `stern` or `tree` for simple examples; `neat` for Monaco editor output; `outdated` for custom parsed table output.
