# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start Electron app in dev mode (hot reload)
npm run build            # Build all three processes (main, preload, renderer)
npm run test             # Run tests once (vitest)
npm run test:watch       # Run tests in watch mode

# Go sidecar
cd go-core && go build ./cmd/podscape-core/   # Build the Go binary
cd go-core && go test ./...                    # Run Go tests

# Distribution
npm run build:mac        # Build macOS DMG + zip (signs + notarizes via afterSign hook)
npm run build:win        # Build Windows NSIS installer
npm run build:linux      # Build AppImage + deb
```

## Architecture

Podscape is a three-process Electron desktop app for Kubernetes management.

### Process layout

```
Renderer (React/TS)
  ├─ HTTP fetch → Go Sidecar (127.0.0.1:5050) — all k8s + helm operations
  └─ IPC via contextBridge → Main Process — terminal, settings, file dialog, kubectl cp, log streaming, port-forward
```

### Go Sidecar (`go-core/`)

The sidecar is a standalone HTTP server compiled as `podscape-core`. It is the source of truth for all Kubernetes and Helm data.

- **Entry:** `go-core/cmd/podscape-core/main.go` — registers all HTTP routes, runs RBAC probe, starts informers, binds to `--port` (default 5050)
- **Handlers:** `go-core/internal/handlers/handlers.go` — one handler per resource type and operation; `MakeHandler(resource, ...)` factory injects an RBAC guard that returns `200 []` + `X-Podscape-Denied: true` for denied resources
- **RBAC:** `go-core/internal/rbac/rbac.go` — concurrent `SelfSubjectAccessReview` probe; `CheckAccess(ctx, clientset)` returns `map[string]bool` (nil on error = permissive); `AllResources` descriptor table (28 resource types); injectable `CheckAccessFunc` var for test isolation
- **Custom resources:** `go-core/internal/handlers/customresource.go` — generic CRD lister via dynamic client; handles `/customresource?crd=<plural>.<group>&namespace=<ns>`
- **Provider detection:** `go-core/internal/handlers/providers.go` + `go-core/internal/providers/detect.go` — detects Istio/Traefik/Nginx via discovery API and IngressClass controller field; handles `/providers`
- **Informers:** `go-core/internal/informers/informers.go` — k8s shared informers cache resource lists in-memory for fast reads; reads `ContextCache.AllowedResources` and skips informers for denied resources; HPA informer uses `autoscaling/v2`
- **Store:** `go-core/internal/store/store.go` — singleton holding the k8s `Clientset` and `Config`; `ContextCache.AllowedResources map[string]bool` carries RBAC probe result (`nil` = permissive, empty = all denied, populated = probed)
- **Port forward:** `go-core/internal/portforward/portforward.go` — manages active tunnels, streams events over WebSocket
- **Exec:** `go-core/internal/exec/exec.go` — WebSocket-based container exec
- **Logs:** `go-core/internal/logs/logs.go` — WebSocket-based log streaming

In **dev**, the sidecar binary is expected at `go-core/podscape-core`. In **production**, it is bundled via `extraResources` to `resources/bin/podscape-core`.

The Electron main process starts the sidecar on app launch (`src/main/sidecar.ts`) and polls `/health` until it responds. If the sidecar fails to start, the app shows an error dialog and quits. The renderer retries sidecar fetch calls up to 20× with 500 ms delays (`src/main/api.ts`).

**Sidecar shutdown:** `sidecar.ts` tracks a `shuttingDown` flag set by `stopSidecar()`. The startup `exitHandler` resolves (not rejects) when `shuttingDown` is true, preventing a spurious "failed to start" dialog when the user quits during the splash screen. `index.ts` also guards the catch block with `if (isQuitting) return` as a second line of defence.

### Main Process (`src/main/`)

Handles operations that require Node.js or native access:

| File | Responsibility |
|------|----------------|
| `index.ts` | App bootstrap, spawns sidecar, creates BrowserWindow |
| `sidecar.ts` | Launch/kill the Go binary subprocess; `shuttingDown` flag prevents false startup-failure dialogs |
| `kubectl.ts` | IPC handlers for all k8s operations; `RBACDeniedError` thrown when sidecar returns `X-Podscape-Denied: true`; unmapped resource kinds route to `/customresource?crd=<name>` |
| `terminal.ts` | PTY terminal sessions via `node-pty` |
| `helm.ts` | Helm CLI IPC handlers (wraps `helm` binary) |
| `settings.ts` | Settings IPC — reads/writes `~/.podscape/settings.json` |
| `dialog.ts` | Native file open/save dialogs |
| `kubeProvider.ts` | Kubeconfig path resolution and management |

**`getResources()` routing in `kubectl.ts`:** built-in k8s resource kinds are mapped via `sidecarMap` to fixed sidecar paths. Any unmapped kind (CRD plural name like `ingressroutes.traefik.io`) is routed to `/customresource?crd=<name>&namespace=<ns>` and throws on non-OK responses so `ProviderResourcePanel` can surface errors. For built-in resources, `getResources` additionally checks the `X-Podscape-Denied: true` response header and throws `RBACDeniedError` so the renderer store can track denied sections separately from generic errors.

### Preload (`src/preload/index.ts`)

Exposes 6 namespaced APIs via `contextBridge`:

- `window.kubectl` — k8s operations + port-forward + log streaming + file copy + `getCustomResource` + `getProviders`
- `window.helm` — Helm release operations
- `window.exec` — PTY exec-into-container sessions
- `window.settings` — read/write app settings
- `window.kubeconfig` — kubeconfig file access
- `window.dialog` — native file picker

`window.electron.shell.openExternal` exists at runtime but not in TS types — cast as `(window.electron as unknown as { shell: { openExternal: (u: string) => void } })`.

### Renderer (`src/renderer/`)

- **`store.ts`** — single Zustand store (`useAppStore`) split into slices: cluster, navigation, resource, operation, providers. Holds context/namespace selection, all resource arrays, navigation state (`section: ResourceKind`), exec modal state, port-forward state, Grafana URL, provider detection state, and `deniedSections: Set<ResourceKind>` (sections the current user cannot list — populated from `X-Podscape-Denied` responses, cleared on context switch)
- **`components/`** — one detail component per resource kind; `ResourceList.tsx` is the generic table for all 27+ resource types (renders an amber "Access denied" banner for sections in `deniedSections`); `ProviderResourcePanel.tsx` handles all Istio/Traefik/Nginx sections
- **`App.tsx`** — top-level layout; reads `section` from store to render the active panel; provider sections (prefixed `istio-`, `traefik-`, `nginx-`) render `ProviderResourcePanel`

### Provider detection (Istio / Traefik / Nginx)

On every successful context switch, `clusterSlice` calls `get().fetchProviders()` (fire-and-forget). `providersSlice` hits `/providers` on the sidecar, which uses the k8s discovery API to detect installed providers:

| Provider | Detection method |
|----------|-----------------|
| Istio | API group `networking.istio.io` present |
| Traefik v3 | API group `traefik.io` present |
| Traefik v2 | API group `traefik.containo.us` present |
| NGINX Inc | API group `k8s.nginx.org` present |
| NGINX Community | IngressClass controller field contains `ingress-nginx` |

The `providers` store value drives conditional Sidebar groups. `fetchProviders` captures the context at call time and discards results if the context changed while the request was in-flight (stale-context guard, same pattern as `probePrometheus`).

**Context switch reset:** `clusterSlice.selectContext` resets `providers` to all-false and, if the active `section` is a provider-specific section (prefixed `istio-`, `traefik-`, `nginx-`), navigates back to `dashboard` to prevent `ProviderResourcePanel` from firing a fetch against a cluster that may lack those CRDs.

### `ProviderResourcePanel` (`src/renderer/components/ProviderResourcePanel.tsx`)

Handles all 15 provider sections. Maps `ResourceKind` → CRD plural name via `SECTION_TO_CRD`. For Traefik v2, `resolvedCrdName()` replaces `.traefik.io` with `.traefik.containo.us`. Loads via `window.kubectl.getCustomResource(ctx, ns, crdName)` → IPC → `getResources()` → `/customresource?crd=...`. Dispatches to typed detail components:

- **Traefik:** `TraefikIngressRouteDetail`, `TraefikMiddlewareDetail`, `TraefikServiceDetail`, `TraefikTLSOptionDetail`
- **Nginx:** `NginxVirtualServerDetail`, `NginxPolicyDetail`, `NginxTransportServerDetail`
- **Istio:** `IstioVirtualServiceDetail`, `IstioDestinationRuleDetail`, `IstioGatewayDetail`, `IstioServiceEntryDetail`, `IstioPeerAuthDetail`, `IstioAuthPolicyDetail`

### Key constants

`src/common/constants.ts` holds `SIDECAR_HOST`, `SIDECAR_PORT` (5050), `SIDECAR_BASE_URL`, and `SIDECAR_WS_URL`. All renderer-to-sidecar fetch calls go through `sidecarFetch()` / `checkedSidecarFetch()` in `src/main/api.ts`.

### Navigation sections (`ResourceKind`)

**Namespace-scoped:** `pods` | `deployments` | `statefulsets` | `replicasets` | `jobs` | `cronjobs` | `daemonsets` | `hpas` | `pdbs` | `services` | `ingresses` | `networkpolicies` | `endpoints` | `pvcs` | `configmaps` | `secrets` | `serviceaccounts` | `roles` | `rolebindings`

**Cluster-scoped:** `nodes` | `namespaces` | `crds` | `ingressclasses` | `pvs` | `storageclasses` | `clusterroles` | `clusterrolebindings`

**Panel-only:** `dashboard` | `events` | `metrics` | `unifiedlogs` | `portforwards` | `helm` | `security` | `tls` | `gitops` | `network` | `connectivity` | `debugpod` | `settings`

**Provider sections (conditional on cluster):**
- Istio: `istio-virtualservices` | `istio-destinationrules` | `istio-gateways` | `istio-serviceentries` | `istio-peerauth` | `istio-authpolicies`
- Traefik: `traefik-ingressroutes` | `traefik-ingressroutestcp` | `traefik-ingressroutesudp` | `traefik-middlewares` | `traefik-services` | `traefik-tlsoptions`
- NGINX Inc: `nginx-virtualservers` | `nginx-policies` | `nginx-transportservers`

### Build notes

- `npm run build` ✅ must stay clean — verify before committing
- The Go binary must be built separately before `npm run dev` if it doesn't exist
- `node-pty` is native; rebuilt by `electron-builder install-app-deps` (postinstall). On macOS the prebuilt `spawn-helper` may lack execute permission — postinstall applies `chmod +x` automatically
- Stale preload builds can cause `window.kubectl.*` to appear as `undefined` — restart `npm run dev` if this happens
- **Custom resource handler** (`/customresource`) uses `dynClientFactory` — a package-level injectable var in `customresource.go` — so tests can inject a fake dynamic client without a real API server

### Release / notarization

Releases are triggered by pushing a `v*` tag. The GitHub Actions workflow (`.github/workflows/release.yml`) builds for macOS (arm64 + x64), Windows, and Linux in parallel.

**macOS signing + notarization** requires these repository secrets:

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded `.p12` certificate (Developer ID Application) |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-char Apple Team ID |
| `GH_TOKEN` | GitHub PAT with `repo` scope (for publishing the release) |

The `afterSign` hook in `package.json` calls `scripts/notarize.js`, which uses `@electron/notarize` with `notarytool`. Notarization is skipped automatically when `APPLE_ID` is not set (Linux/Windows CI).

To encode the `.p12`:
```bash
base64 -i /path/to/Certificates.p12 | pbcopy
```

To trigger a release:
```bash
git tag v2.0.0 && git push origin v2.0.0
```

---

## Review protocol

Review this plan thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs, give me an opinionated recommendation, and ask for my input before assuming a direction.
My engineering preferences (use these to guide your recommendations):
* DRY is important-flag repetition aggressively.
* Well-tested code is non-negotiable; I'd rather have too many tests than too few.
* I want code that's "engineered enough" - not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity).
* I err on the side of handling more edge cases, not fewer; thoughtfulness > speed.
* Bias toward explicit over clever.
1. Architecture review
Evaluate:
* Overall system design and component boundaries.
* Dependency graph and coupling concerns.
* Data flow patterns and potential bottlenecks.
* Scaling characteristics and single points of failure.
* Security architecture (auth, data access, API boundaries).
2. Code quality review
Evaluate:
* Code organization and module structure.
* DRY violations-be aggressive here.
* Error handling patterns and missing edge cases (call these out explicitly).
* Technical debt hotspots.
* Areas that are over-engineered or under-engineered relative to my preferences.
3. Test review
Evaluate:
* Test coverage gaps (unit, integration, e2e).
* Test quality and assertion strength.
* Missing edge case coverage-be thorough.
* Untested failure modes and error paths.
4. Performance review
Evaluate:
* N+1 queries and database access patterns.
* Memory-usage concerns.
* Caching opportunities.
* Slow or high-complexity code paths.
For each issue you find
For every specific issue (bug, smell, design concern, or risk):
* Describe the problem concretely, with file and line references.
* Present 2-3 options, including "do nothing" where that's reasonable.
* For each option, specify: implementation effort, risk, impact on other code, and maintenance burden.
* Give me your recommended option and why, mapped to my preferences above.
* Then explicitly ask whether I agree or want to choose a different direction before proceeding.
Workflow and interaction
* Do not assume my priorities on timeline or scale.
* After each section, pause and ask for my feedback before moving on.
BEFORE YOU START:
Ask if I want one of two options:
1/ BIG CHANGE: Work through this interactively, one section at a time (Architecture → Code Quality → Tests → Performance) with at most 4 top issues in each section.
2/ SMALL CHANGE: Work through interactively ONE question per review section
FOR EACH STAGE OF REVIEW: output the explanation and pros and cons of each stage's questions AND your opinionated recommendation and why, and then use AskUserQuestion. Also NUMBER issues and then give LETTERS for options and when using AskUserQuestion make sure each option clearly labels the issue NUMBER and option LETTER so the user doesn't get confused. Make the recommended option always the 1st option.
