# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server + Electron (hot-reload)
npm run build        # Production build (main + preload + renderer)
npm run build:mac    # Build + package as macOS app
npm run build:win    # Build + package as Windows app
npm run build:linux  # Build + package as Linux app
npm start            # Preview production build
```

There are no test commands — the project has no test suite.

After `npm install`, the postinstall script runs `electron-builder install-app-deps` and fixes execute permissions on `node-pty`'s prebuilt spawn-helper binaries (required on macOS or PTY terminals will fail with a misleading "posix_spawnp failed" error).

## Architecture

This is an Electron desktop app with strict process isolation: the **main process** has full Node.js access, the **renderer** runs in a sandboxed browser context, and the **preload** bridges them via `contextBridge`.

### Process Boundaries

```
Renderer (React/Zustand)
    ↕  window.kubectl / window.terminal / window.exec / window.settings / window.plugins
Preload  (src/preload/index.ts)
    ↕  ipcRenderer.invoke / ipcRenderer.on
Main Process
    ├── src/main/kubectl.ts    — all kubectl shell execution + log streaming
    ├── src/main/terminal.ts   — node-pty sessions for Terminal + ExecPanel
    └── src/main/settings.ts   — ~/.podscape/settings.json read/write
```

The renderer **never** runs shell commands directly. Every kubectl call goes through `window.kubectl.*` → IPC → `src/main/kubectl.ts` → `execFile('kubectl', ...)`.

### Main Process (`src/main/`)

- **`kubectl.ts`** — `findKubectl()` resolves the binary (user setting → common paths → `'kubectl'`). `spawnKubectl()` wraps `execFile` with a 20 MB buffer. All `ipcMain.handle('kubectl:*')` handlers live here. Log streaming uses `spawn` with a persistent `activeStreams` map keyed by UUID.
- **`terminal.ts`** — `node-pty` PTY sessions for both the Terminal panel and container exec. Sessions stored in a Map; push-events (`terminal:data`, `exec:data`) are sent back to the renderer via `webContents.send`.
- **`settings.ts`** — Reads/writes `~/.podscape/settings.json`. `getSettings()` is imported by `kubectl.ts` so the user-configured kubectl path is always respected.

### Preload (`src/preload/index.ts`)

Exposes five typed APIs to `window.*`: `kubectl`, `terminal`, `exec`, `plugins`, `settings`. The global `Window` interface is extended in `src/renderer/store.ts` so the renderer has full TypeScript types for all IPC calls.

### Renderer State (`src/renderer/store.ts`)

Single Zustand store (`useAppStore`). Key patterns:

- **`section: ResourceKind`** drives navigation. `setSection()` calls `loadSection()` which switches on the section name to fetch the right resource arrays.
- **`_all` sentinel** for `selectedNamespace` → passed as `null` to kubectl handlers → triggers `--all-namespaces`.
- **`contextSwitchSeq`** — monotonic counter to discard stale responses when the user switches contexts rapidly.
- **Special sections** (`terminal`, `grafana`, `extensions`, `network`, `metrics`) return early from `loadSection` without touching resource arrays — they manage their own data.
- **`NetworkPanel`** is an exception: it loads its own data locally via direct `window.kubectl` calls (independent of the store), to avoid namespace-scoping conflicts with other panels.

### Renderer Components (`src/renderer/components/`)

- **`Sidebar.tsx`** — navigation tree with context/namespace dropdowns. Each `NavItem` calls `store.setSection()`.
- **`ResourceList.tsx`** — generic table that reads from the store's resource arrays. Right-click opens a context menu with scale/restart/delete/YAML/exec actions depending on resource kind.
- **`App.tsx`** — top-level router: switches on `section` to render the correct panel. `DetailPanel` wraps individual detail components in an `ErrorBoundary` keyed by `resource.uid`.
- **`NetworkPanel.tsx`** — SVG graph visualization (no external libraries). Contains `buildGraph()`, `runForceSimulation()`, `computeTopoPositions()`, and two sub-views (`TopologyView`, `MapView`). Both views use `useMemo` for position computation (synchronous, avoids async re-render race with `fitToScreen`).
- **`PodDetail.tsx`** — log streaming via `window.kubectl.streamLogs`, exec button triggers `store.openExec()` which mounts `ExecPanel` as a full-screen overlay.

### Adding a New Section

1. Add the section name to the `ResourceKind` union in `src/renderer/types.ts`
2. Add a load branch in `loadSection()` in `src/renderer/store.ts` (or add it to the early-return special-sections list)
3. Add a route branch in `App.tsx`
4. Add a `NavItem` in `Sidebar.tsx` with an icon path in the `ICONS` object

### Key Files

| File | Purpose |
|------|---------|
| `src/renderer/types.ts` | All Kube resource interfaces + `ResourceKind` union + helper functions |
| `src/renderer/store.ts` | Zustand store — all state + IPC orchestration |
| `src/renderer/App.tsx` | Top-level router + `ErrorBoundary` + `DetailPanel` switcher |
| `src/main/kubectl.ts` | All kubectl IPC handlers |
| `src/preload/index.ts` | IPC bridge — source of truth for all available `window.*` APIs |
| `electron.vite.config.ts` | Three separate Vite configs (main/preload/renderer) |

### Runtime Notes

- `node-pty` is excluded from asar (`"asarUnpack": ["**/node_modules/node-pty/**"]`) because it ships native binaries.
- The `@renderer` path alias resolves to `src/renderer/`.
- Settings persist to `~/.podscape/settings.json`; plugins are discovered from `~/.podscape/plugins/`.
- Secret values are masked in `kubectl.ts` before being sent to the renderer — only keys are returned, values replaced with `***MASKED***`.
