# Changelog

## [2.2.2] — 2026-03-25

### Fixes

- **CI:** `gh release upload` for `podscape-mcp` binaries now targets `codingprotocols/podscape` — all binaries are released from the main repo

---

## [2.2.1] — 2026-03-25

### Fixes

- Strip debug symbols (`-s -w`) from all Go release binaries — reduces `podscape-core` from 89 MB to 60 MB and `podscape-mcp` from 82 MB to 56 MB, bringing the macOS DMG back to its expected ~130 MB size

---

## [2.2.0] — 2026-03-25

### New features

#### Podscape MCP Server (`podscape-mcp`)
- New standalone binary that exposes your Kubernetes cluster as MCP (Model Context Protocol) tools for AI assistants such as Claude and Cursor
- Ships as a pre-built binary for macOS (arm64 + amd64), Windows (amd64), and Linux (amd64); published alongside the app on every GitHub Release
- **20 tools across three categories:**
  - *Read-only:* `list_resources`, `get_resource`, `get_resource_yaml`, `get_pod_logs`, `list_events`, `list_contexts`, `get_current_context`, `list_namespaces`, `helm_list`, `helm_status`, `helm_values`, `security_scan`, `detect_providers`
  - *Mutating:* `scale_resource`, `delete_resource`, `rollout_restart`, `rollout_undo`, `apply_yaml`, `helm_rollback`
  - *Diagnostic aggregation:* `pod_summary` (status + events + logs in one call), `cluster_health` (node/pod counts + recent warnings), `list_failing_pods`, `get_resource_events`
- Log output is capped (512 KB total / 32 KB per container in `pod_summary`) with explicit truncation messages to prevent OOM in AI contexts
- `managedFields` stripped from all responses — reduces payload size by 60–70% on large resources
- Kubeconfig resolution follows the standard order: explicit `--kubeconfig` flag → `$KUBECONFIG` → `~/.kube/config`

#### Shared client package (`internal/client`)
- New `client.Init()` function and `ClientBundle` struct centralise Kubernetes client initialisation (REST config, clientset, apiextensions client, active context name) for use by both `podscape-core` and `podscape-mcp`
- QPS (50) and Burst (100) tuning applied consistently across all binaries; API deprecation warnings suppressed uniformly

#### Ops package (`internal/ops`)
- New `internal/ops` package consolidates Kubernetes write operations shared between the sidecar and MCP server: `ListResource`, `GetResource`, `Scale`, `Delete`, `RolloutRestart`, `RolloutUndo`, `ApplyYAML`
- All operations accept a `*client.ClientBundle`, making them straightforward to unit-test without a live cluster

### Improvements

- **`podscape-core` startup** simplified — client initialisation now delegates to `client.Init()`, removing ~30 lines of duplicated config/clientset setup from `main.go`
- **Log streaming** (`internal/logs`): scanner token buffer raised to 256 KB to handle long log lines without silent truncation errors; scanner errors are now propagated to callers

### Tests

- New `go-core/cmd/podscape-mcp/tools_test.go`: arg-extraction helpers (`TestArgStr`, `TestArgFloat`, `TestArgBool`) and security scanner (`TestScanPods_NoSecurityContext`, `TestScanPods_PrivilegedContainer`, `TestScanPods_RunAsRootViaContainerSC`, `TestScanPods_RunAsNonRootSuppressesRootFinding`, `TestScanPods_PodLevelRunAsRoot`, `TestScanPods_ResourceLimits`, `TestScanPods_HostNamespace`, and more)
- New `go-core/internal/ops/ops_test.go`: coverage for all ops functions using fake k8s clients

### Release / distribution

- GitHub Actions release workflow now builds and uploads `podscape-mcp` binaries for all platforms as part of the existing `v*` tag release flow — no separate pipeline required

---

## [2.1.0] — 2026-03-22

### New features

#### RBAC-aware startup
- The sidecar now runs a `SelfSubjectAccessReview` probe (concurrent `list`+`watch` checks, 8-goroutine pool, 10 s deadline) at startup and on every context switch before starting informers
- Informers are only registered for resources the current user can access; inaccessible resources are silently skipped rather than producing watch errors in cluster logs
- A new `internal/rbac` package (`rbac.go` / `rbac_test.go`) owns the SAR logic and exposes `CheckAccessFunc` — an injectable var used by both `main.go` and `HandleSwitchContext` for test isolation
- Each `ContextCache` carries an `AllowedResources map[string]bool` field with three-state semantics: `nil` = probe not yet run (permissive), empty map = all denied, populated map = probed result
- `MakeHandler` factory now accepts a `resource string` parameter; all 27 built-in handlers include an RBAC guard that returns `200 []` + `X-Podscape-Denied: true` header when the resource is denied
- The renderer detects `X-Podscape-Denied: true` via `RBACDeniedError` (thrown by the main-process `getResources` IPC handler) and stores denied sections in a new `deniedSections: Set<ResourceKind>` store field; `ResourceList` shows an amber "Access denied" banner instead of the generic empty state

#### HPA improvements
- **v2 metrics**: Informer upgraded from `autoscaling/v1` to `autoscaling/v2`; cached HPA objects now include `spec.metrics` and `status.currentMetrics` so the existing metric parser in `HPADetail` renders resource, container-resource, Pods, and External metrics with target-vs-current comparison
- **Scale reason**: The most recent `SuccessfulRescale` event message is parsed and displayed as a human-readable "Last scale reason" banner in the replica gauge card
- **Events tab**: HPA detail now shows a dedicated events section (newest-first, capped at 15) filtered by `involvedObject.name/kind`
- **Auto-refresh**: Events re-fetch every 30 seconds while the HPA detail panel is open

#### Events in DaemonSet and Job detail views
- `DaemonSetDetail` gains a new **Events** tab alongside the existing Overview and Analysis tabs; the tab badge shows the count of Warning-type events
- `JobDetail` gains an **Events** section rendered below the conditions timeline; same amber/gray Warning/Normal visual treatment

### Improvements

- **`getEvents` return type**: `window.kubectl.getEvents` is now properly typed as `Promise<KubeEvent[]>` in the preload, eliminating manual type casts in callers
- **IPC double-registration fix**: `ipcMain.handle('shell:openExternal', ...)` moved out of `createWindow()` into the `app.whenReady()` block, preventing a crash on macOS `activate` events (window re-creation)
- **Cross-platform keyboard shortcut labels**: `CommandPalette` and `ConnectivityTester` now display `⌘` on macOS and `Ctrl+` on Windows/Linux via the `isMac` platform utility

### Tests

- New `internal/rbac/rbac_test.go`: `TestCheckAccess_AllAllowed`, `TestCheckAccess_PartialDenied`, `TestCheckAccess_BothVerbsRequired`, `TestCheckAccess_SARAPIUnavailable`, `TestCheckAccess_AllDenied`, `TestCheckAccess_AllResourcesPresent`, `TestRbacAllowed_NilMap_Permissive`, `TestRbacAllowed_EmptyMap_AllDenied`
- New `internal/handlers/handlers_crd_test.go`: RBAC guard tests for `MakeHandler`, `HandleCRDs`, and `runRBACProbe` (`TestMakeHandler_DeniedResource_ReturnsEmptyArrayWithHeader`, `TestMakeHandler_AllowedResource_ReturnsData`, `TestMakeHandler_NilAllowedResources_Permissive`, `TestHandleCRDs_DeniedByRBAC_ReturnsEmptyArrayWithHeader`, `TestHandleSwitchContext_RBACProbeStored`, `TestHandleSwitchContext_RBACProbeFailed_NilAllowed`)
- Existing `TestHandleSwitchContext_*` tests updated with a `noopRBAC` stub so they are not affected by the concurrent SAR calls added to `HandleSwitchContext`

---

## [2.0.0] — 2026-03-19

### New features

#### Service mesh & ingress controller support
- **Istio** — auto-detected via `networking.istio.io` API group; dedicated sidebar section with six resource views: Virtual Services, Destination Rules, Gateways, Service Entries, Peer Authentications, Authorization Policies
- **Traefik v2 + v3** — auto-detected via `traefik.containo.us` / `traefik.io` API groups; sidebar section with Ingress Routes, Ingress Routes TCP/UDP, Middlewares, Traefik Services, TLS Options; v2 CRD group fallback handled transparently
- **NGINX Inc** — auto-detected via `k8s.nginx.org` API group; sidebar section with Virtual Servers, Policies, Transport Servers
- **NGINX Community** — detected via IngressClass controller field; adds an "NGINX Config" tab to standard Ingress detail views with grouped annotation viewer (SSL/TLS, Proxy, Rate Limiting, Auth, CORS, Rewrites, Load Balancing, Snippets)
- Provider detection runs automatically on every context switch and is discarded if the context changes mid-fetch (stale-context guard)

#### Generic CRD resource panel (`ProviderResourcePanel`)
- Split-panel layout (resizable detail pane, 280–600 px) shared across all 15 provider sections
- Typed detail components for every resource kind with rich visualisations: weighted traffic bars, fault badges, TLS version ranges, middleware type auto-detection, mTLS hero badges, and more
- Navigates back to the Dashboard automatically when switching to a cluster that lacks the active provider's CRDs

#### Go sidecar — generic CRD endpoint
- New `/customresource?crd=<plural>.<group>&namespace=<ns>` endpoint lists any CRD using the k8s dynamic client and discovery API
- Eliminates the previous silent-empty-array behaviour for unknown resource kinds; errors now surface as visible messages in the panel

#### Network intelligence panels (introduced in 2.0)
- **Real-time Network Map** — topology graph with force-directed layout
- **Cross-Namespace Connectivity Tester** — live pod-to-pod and pod-to-service reachability checks
- **TLS Certificate Dashboard** — cluster-wide certificate inventory with expiry tracking
- **GitOps Panel** — Argo CD / Flux resource overview

### Improvements

- **Context switch** — provider sidebar groups reset to hidden instantly when switching contexts; provider-specific sections (Istio/Traefik/Nginx) auto-navigate to Dashboard on switch so stale data is never shown
- **Splash screen shutdown** — closing the app during the splash screen no longer shows a spurious "Sidecar failed to start" error dialog; a `shuttingDown` flag in `sidecar.ts` ensures the startup promise resolves cleanly on intentional quit
- **UI consistency** — unified `PageHeader` component across all list views; standardised glass-panel borders, badge colours, and dark-mode backgrounds

### Fixes

- Traefik TCP/UDP route CRD plural names corrected (`ingressroutetcps` / `ingressrouteudps`)
- `getCustomResource` IPC now throws on sidecar errors instead of silently returning an empty array
- `fetchProviders` stale-context race condition fixed (same guard pattern as `probePrometheus`)

### Release / distribution

- macOS builds are signed with a Developer ID Application certificate and notarized via Apple's `notarytool`
- Universal DMG (arm64 + x64) and ZIP artifacts published to GitHub Releases
- All secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) managed via GitHub Actions repository secrets

---

## [1.2.0] — 2025

- Prometheus-based cluster utilisation charts
- Helm repository browser
- Kubernetes owner-chain visualisation
- Security scan download and `ResourceTable` component
- Kubeconfig onboarding flow
- Prometheus URL auto-detection and per-context persistence

## [1.1.0] — 2025

- TLS Certificate dashboard
- GitOps panel (initial)
- `PageHeader` component and design system refresh
- `useYAMLEditor` hook; UnifiedLogs and port-forward panels

## [1.0.0] — 2025

- Initial release: pods, deployments, services, ingresses, configmaps, secrets, nodes, namespaces, CRDs, RBAC, storage, HPA, PDB, events, metrics
- Go sidecar architecture replacing kubectl IPC calls
- Helm release management
- PTY terminal and exec-into-container
- Port-forward manager
- Network topology graph
- Security Hub (kubesec + Trivy)
