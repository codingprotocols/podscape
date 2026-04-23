## [3.1.1] — 2026-04-23

### Fixes

- **ExecPanel buttons unresponsive** — Upload, Download, and Close buttons in the exec terminal header were never clickable. Root cause: `PageHeader` sets `WebkitAppRegion: drag` for frameless-window dragging; Electron's compositor applies drag regions by painted position regardless of CSS z-index, so the ExecPanel overlay (visually on top) was still routing mousedown events to OS window dragging. Fixed by adding `WebkitAppRegion: no-drag` to the ExecPanel outer container, matching the same pattern already used in CommandPalette.
- **Upload fails with "absolute paths are not allowed"** — `sanitizeCPToLocalPath` in the Go sidecar immediately rejected any absolute path, but the native file dialog always returns absolute paths. The function now resolves all paths (absolute or relative) to a canonical absolute path via `filepath.Abs` + `filepath.EvalSymlinks` before checking that the file lives within the user's home or temp directory. The security boundary is unchanged.

---

## [3.1.0] — 2026-04-21

### New features

#### Kubectl Plugin Panel (Krew)
- **New "Plugins" sidebar section** — browse and manage kubectl plugins via Krew directly from Podscape, no terminal required.
- **Curated plugin list** — Browse tab shows 7 hand-picked plugins (neat, stern, tree, images, whoami, df-pv, outdated) instead of the raw ~200-entry Krew index.
- **Installed tab** — shows all plugins currently installed via Krew; only curated plugins are displayed (non-curated plugins are not shown).
- **One-click install / uninstall** — installs via `krew install`; uninstalls via `krew uninstall`. Install no longer blocks on `krew update`, making installs instant.
- **Krew auto-install** — if Krew is not present, a guided install flow downloads and runs the Krew installer with step-by-step progress output and macOS quarantine fix (`xattr -d com.apple.quarantine`).
- **Inline plugin runner** — each plugin detail view includes a Run tab with namespace/resource/argument inputs and live streaming output.
- **Individual plugin panels:**
  - **neat** — cleans up Kubernetes manifests; supports yaml and json output formats with a format selector dropdown. Uses correct `kubectl neat get -- <kind> <name> -n <ns> --output <format>` syntax.
  - **stern** — multi-pod log tailing with pod name filter, namespace, and container regex inputs.
  - **tree** — displays object ownership hierarchies; shows a kind→name selector.
  - **images** — lists all container images running in the cluster.
  - **whoami** — shows the currently authenticated subject.
  - **df-pv** — shows disk usage across PersistentVolumes.
  - **outdated** — finds outdated container images in the cluster.
- **YAML indentation preserved** — plugin output correctly preserves leading whitespace (was incorrectly stripped by `trim()`).
- **Plugin binary resolution** — `resolvePluginCommand()` checks `~/.krew/bin/kubectl-<name_underscored>` directly before falling back to `kubectl <name>`, handling Krew's hyphen→underscore binary naming convention.
- **Krew excluded from plugin list** — `krew` itself is filtered out of both the installed and browse lists to avoid confusing self-management UI.
- **Windows guard** — Krew is not supported on Windows; the panel shows a clear unsupported notice instead of attempting detection (uses `krewUnsupported` store flag, not `process.platform` which is unavailable in the renderer).

#### Window dragging improvements
- **PageHeader drag region** — the title area of every panel header is now a drag region, allowing the window to be moved by grabbing any panel's top bar.
- **Dashboard drag region** — an invisible 32 px drag strip is added at the top of the Dashboard (which has no PageHeader), so the window can be dragged from there too.

### Fixes

- **Monaco cursor leak** — `cursor: text` from Monaco editors no longer bleeds outside editor bounds in Electron. Fixed with `cursor-default` on container divs in KrewPanel, YAMLEditor, YAMLViewer, and ExecPanel.
- **macOS DMG size** — added explicit `files` config to electron-builder (`out/**/*` only) to prevent the entire project directory from being bundled into the app asar. The `.claude/` plugin cache and all dev-only files are now excluded, reducing the asar from ~210 MB to ~5 MB and the macOS DMG from ~450 MB to ~150 MB.

### Improvements

- **Panel toggles** — Plugins, FinOps, GitOps, and Network Map / Connectivity panels can each be independently enabled or disabled from Settings → Panels. The sidebar updates immediately on save; disabling a panel while viewing it navigates to the dashboard.

### Dependencies

- `dompurify` 3.3.3 → 3.4.0 — fixes mXSS via re-contextualization, prototype pollution via `CUSTOM_ELEMENT_HANDLING` and `USE_PROFILES`, `ADD_ATTR` predicate bypass, and several other security issues.
- `github.com/moby/spdystream` 0.5.0 → 0.5.1 — header size/count limits and frame length guards.

---

## [3.0.1] — 2026-04-16

### Fixes

- Re-tag release to work around immutable tag setting that prevented v3.0.0 from publishing correctly.

---

## [3.0.0] — 2026-04-16

### MCP Server overhaul

#### File organisation
- Deleted the 1200-line monolithic `tools.go` and replaced it with six focused files: `tools_helpers.go`, `tools_read.go`, `tools_diag.go`, `tools_mutate.go`, `tools_helm.go`, and `register.go`. Each file owns one category of tools and exposes a `register*Tools()` function composed by a single `registerTools()` entry point.

#### Thread safety
- Replaced the bare `bundle *client.ClientBundle` global with a `sync.RWMutex`-guarded pair. All 23 tool handlers acquire `RLock`; `switch_context` acquires the write lock only after validating the target context, keeping the critical section minimal.

#### New tools (9)
- **`describe_resource`** — fetches a resource and its events in one call (replaces two round-trips for `kubectl describe`-style workflows).
- **`exec_command`** — executes a one-shot command inside a running pod container and returns combined stdout+stderr. Non-zero exit codes are reported in the result text rather than as tool errors.
- **`switch_context`** — switches the active Kubernetes context mid-session; all subsequent tool calls use the new cluster immediately.
- **`cordon_node`** — cordon or uncordon a node (`spec.unschedulable` patch).
- **`drain_node`** — evicts all evictable pods from a node with configurable `force`, `ignore_daemonsets`, and `delete_emptydir_data` options. Returns `{ evicted, skipped, failed }` with per-pod failure reasons.
- **`trigger_cronjob`** — creates a Job from a CronJob's `spec.jobTemplate`, equivalent to `kubectl create job --from=cronjob/<name>`.
- **`helm_history`** — lists all revisions of a Helm release with status, chart version, and description.
- **`helm_upgrade`** — upgrades an existing release or installs it if absent (`--install`). Accepts an optional YAML values string merged over chart defaults.
- **`helm_uninstall`** — uninstalls a Helm release and removes all associated Kubernetes resources.

#### Improved tools (4)
- **`list_resources`** — added `field_selector` parameter (e.g. `status.phase=Running`, `spec.nodeName=node-1`).
- **`get_pod_logs`** — added `init_container` bool; when true, fetches logs from init containers.
- **`pod_summary`** — now fetches init container logs concurrently alongside main container logs. Init container logs appear in `container_logs` keyed as `init:<name>`.
- **`security_scan`** — three new per-container checks: `allowPrivilegeEscalation` not set to `false` (WARN), `readOnlyRootFilesystem` not set to `true` (WARN), and dangerous capabilities present (`NET_ADMIN`, `SYS_ADMIN`, `SYS_PTRACE`, `ALL`) (HIGH).

#### Safety gates
- `delete_resource`, `drain_node`, and `helm_uninstall` now require `confirm=true` to execute. Calling without it returns a preview of what would be affected — no cluster state is changed. The `drain_node` preview lists the exact pods that would be evicted vs skipped (capped at 50 entries with a `truncated` flag).

#### New Go internals
- `client.InitWithContext` — builds a `ClientBundle` against a specific kubeconfig context using `ConfigOverrides{CurrentContext}`.
- `client.ValidateContext` — validates that a context name exists in the kubeconfig before acquiring the write lock in `switch_context`.
- `helm.UpgradeRelease` — wraps `action.NewUpgrade` with `LocateChart` + `loader.Load` to support local paths, repo references, and OCI references.

---

## [2.8.0] — 2026-04-10

### New features

#### Update Center
- **In-app update dashboard:** Dedicated "Update Center" at the bottom of the Settings panel. Users can manually check for updates, view current version and stay secure with the latest release info.
- **Download progress:** Real-time progress bar shows download percentage for in-flight updates.
- **One-click restart:** Replaced background auto-install with an explicit "Restart to Update" button once the download is ready.

#### Helm Management
- **Upgrade workflow removal (2.8.0):** Removed the in-app Helm upgrade workflow in this release to keep Podscape focused on auditing and management; Helm upgrade capability was later reintroduced in 3.0.0 via the MCP `helm_upgrade` tool.
- **Improved version detection:** Refactored Helm version checking to use a unified `repoLatest` endpoint, supporting semver comparisons across multiple repositories.
- **Performance:** Implemented lazy loading for Helm repository indices to reduce memory overhead and initialization time.
- **Semver sorting:** Improved version sorting logic to correctly handle pre-release and metadata tags in Helm charts.

#### Native Application Menu
- **Custom menubar:** Replaced the default Electron menu with a tailored application menu bar (macOS native menu).
- **Help & Docs integration:** Added direct links to Official Documentation, GitHub Discussions, and Issue Reporting.
- **Check for Updates link:** Added "Check for Updates..." to the app menu (macOS) and Help menu (Win/Linux).

### Improvements

- **Pod Status UI Refactor:** Redesigned Pod detail header with a more modern semantic color palette (Dual-mode Emerald/Amber tokens). Header title now includes the `. POD` resource type marker.
- **Restart Analysis Navigation:** Clicking the pod restart badge now selects the pod and automatically triggers the "Restart Analyzer" tool instead of a hard redirect to the debug section.

### Fixes

- **"Ask a Question" URL fix:** Added `?category=q-a` to the GitHub Discussions link to ensure users land directly on the relevant category and avoid the "Page not recognized" error.
- **Settings panel spacing:** Removed redundant margins and excessive padding-bottom from Prometheus, Cost, and Update Center sections for a cleaner, more consistent layout.
- **TypeScript `window.updater` type:** Fixed "possibly undefined" errors in the renderer by updating the global `env.d.ts` declaration and implementing defensive optional chaining for IPC calls.
- **YAML Editor options:** Added configurable editor options to YAML components, including font size and line number toggles for better readability.
- **Security (CodeQL):** implemented path sanitization for various file-system operations to resolve CodeQL findings related to uncontrolled data in path expressions.
- **Dependency cleanup:** Removed unused imports and deleted redundant test files following the Helm architecture refactor.

---

## [2.7.0] — 2026-04-08

### New features

#### Unified Logs
- **Page header with search:** Unified Logs now uses the standard `PageHeader` layout. Log search has moved to the top-right, consistent with other panels.
- **Inline pod pills:** Selected pod pills and the "Add pods" search dropdown are now in the same controls row as Start/Stop, Clear, and Auto-scroll — no separate row.
- **Dynamic subtitle:** The page subtitle shows the live streaming state ("2 pods streaming · 145 lines", "3 pods selected", etc.).

#### Debug Pod Launcher
- **Instant pod removal:** Clicking Delete now removes the pod from the Workloads → Pods list immediately (optimistic update), without waiting for Kubernetes graceful termination.
- **Delete error surfacing:** If deletion fails, a red error message is shown in the panel instead of silently swallowing the error.

### Improvements

- **`RefreshButton` component:** Refresh button extracted into a shared `RefreshButton` component, eliminating repetition across Dashboard, HelmPanel, GitOpsPanel, TLSCertDashboard, ProviderResourcePanel, CronJobDetail, DeploymentDetail, HelmReleaseDetail, and HelmRepoBrowser.
- **Auto-scroll guard (Unified Logs):** Programmatic `scrollTop` assignments are now guarded with a 50 ms `ignoringScrollRef` window — matching the fix already in PodDetail — so they no longer fight user-initiated scrolls.
- **Auto-scroll re-enable on scroll-to-bottom:** Scrolling back to the bottom in Unified Logs re-enables auto-scroll automatically, consistent with PodDetail behaviour.
- **Pod list refresh after delete:** Deleting a debug pod now also calls `loadSection('pods')` to sync the workloads list with the real cluster state.
- **"Stop" renamed to "Delete"** in the Debug Pod Launcher to accurately reflect the action.

### Fixes

- **Log streaming stop (PodDetail):** Stopping a stream now cancels the flush timer and discards buffered lines, so in-flight chunks no longer appear after clicking Stop.
- **Log streaming stop (Unified Logs):** Same fix applied — `pendingBuffer` is cleared and `streamIds` is wiped before calling `stopLogs`, so late-arriving chunks are discarded by the stream ID guard in the `onChunk` callback.
- **Multi-container auto-restart:** Switching containers in a multi-container pod (e.g. Airflow) while streaming now automatically restarts the stream for the newly selected container via a `startStreamRef` always-current ref pattern.
- **Exec error overlay:** Shell errors no longer auto-close after 500 ms. A persistent overlay shows the full error message until the tab is closed.
- **Pod search in Unified Logs:** Pods are now fetched via `loadSection('pods')` on mount and on namespace change, so the "Add pods" search works even when navigating directly to Unified Logs without visiting the Pods section first.
- **Debug pod deletion sandbox:** Removed a `fetch()` call to the sidecar from the renderer — `sandbox: true` in the Electron window blocks direct HTTP calls to localhost. Deletion now goes through the correct IPC path (`window.kubectl.deleteResource`).
- **`RefreshButton` title prop:** Caller-supplied `title` no longer gets overridden by the internal `label` fallback. Spread order fixed and resolved as `props.title ?? label`.
- **"Sync" label corrected to "Refresh":** GitOpsPanel and HelmPanel refresh buttons were mislabelled "Sync" (a GitOps reconciliation concept); reverted to "Refresh".
- **`window.sidecar` typed:** Replaced `any` with a typed `SidecarAPI` interface (`onCrashed`, `restart`) in `env.d.ts`.
- **Dangling `provider-details` export removed** from `components/index.ts` (directory does not exist).
- **Unused `LOG_FLUSH_INTERVAL_MS` constant removed** from `PodDetail.tsx`.

### Reliability & architecture

#### File copy (Debug Pod)
- **`copyToContainer` no longer requires `tar` in the container:** Replaced the `tar xf -` approach (which failed on minimal images like busybox/alpine) with `sh -c "mkdir -p '…' && cat > '…'"`. Raw bytes are piped directly — works in every container that has `/bin/sh`. The `tar` npm package has been removed from `dependencies`.
- **`copyToContainer` moved to sidecar:** The main process no longer constructs tar archives. The Go sidecar owns all file I/O using `archive/tar` from the standard library.
- **`copyFromContainer` is now fully streaming:** The sidecar streams the file directly via `cat` to the HTTP response body; the main process pipes it to disk with `stream/promises.pipeline` + `fs.createWriteStream`. Memory usage is constant regardless of file size. Partial files are deleted on error.

#### Memory leaks & listener cleanup
- **`useLogBuffer.reset()` cancels pending flush:** Calling `reset()` no longer risks a stale timer firing after the buffer is cleared.
- **Security scan listener deduplication:** `analysisSlice.scanSecurity` now tracks the active `onSecurityProgress` listener in a module-level ref and tears it down before registering a new one, preventing duplicate progress lines when scans overlap.
- **Port forwards cleaned up on context switch:** `clusterSlice.selectContext` calls `stopAllPortForwards()` before switching, removing all IPC listener subscriptions and clearing the `portForwards` state.
- **CronJob refresh timer cleaned up on unmount:** `CronJobDetail` now tracks the `setTimeout` in a `useRef` and clears it on unmount, preventing stale callbacks from firing after the component is gone.
- **WebSocket `removeAllListeners()` before close:** All log-stream and exec-stream teardown paths call `ws.removeAllListeners()` before `ws.close()`, preventing stale `close` event handlers from firing after deliberate teardown.

#### Context switch correctness
- **Log streams cancelled on context switch:** `switchContext` now calls `cancelAllLogStreams()` before sending the switch request to the sidecar, preventing stream ID collisions across contexts.
- **`before-quit` ordering fixed:** The app now cancels all log and exec streams before stopping the sidecar, preventing IPC handlers from firing against a dead process during shutdown.

#### Static imports (production safety)
- **`ws`, `net` no longer dynamically required:** `import WebSocket from 'ws'` and `import { createServer } from 'net'` replace `require()` calls that would fail in production asar bundles if the packages were not listed in `dependencies`.
- **`@types/ws` added** to `devDependencies` for full TypeScript coverage of the WebSocket API.

---

## [2.6.0] — 2026-04-07

### New features

#### Dynamic CRD Browser
- **Generic CRD instance browser:** Clicking any CRD in the Cluster → CRDs list now opens a full-page detail view instead of a cramped side panel. The page shows the CRD's metadata header, instance count, and a resizable list + detail split.
- **Full-page CRD detail:** The CRD detail takes over the entire main content area, giving the instance list and detail pane room to breathe. A `← CRDs` breadcrumb in the header navigates back to the list.
- **Instance list with resizable detail pane:** Click any instance to open its detail panel on the right; drag the divider to resize. Clicking the selected row again closes the panel.
- **Tabbed instance detail (Metadata / Spec / YAML Edit):** Each instance shows a Metadata tab (name, namespace, API version, labels, annotations), a Spec tab (spec rendered as readable YAML), and a YAML Edit tab with full in-place edit and apply support.
- **Spec as readable YAML:** The Spec tab renders the instance's spec as formatted YAML text — no more nested dropdowns. Scroll and read, just like `kubectl get -o yaml`.
- **Universal provider resource browser:** All Istio, Traefik, and NGINX CRD sections use the same generic detail panel. Hand-crafted per-resource detail components have been removed (18 files). Summary columns remain for the most common sections (route counts, hosts, mTLS mode, etc.).
- **Traefik v2 fallback:** If the cluster runs Traefik v2, CRD names are automatically rewritten from `.traefik.io` to `.traefik.containo.us`.

### Improvements

- **CRD row selection fix:** Switching between instances no longer collapses the detail panel. Selection uses the composite key `uid ?? namespace/name` so same-name resources in different namespaces are correctly distinguished.
- **YAML state reset on item switch:** Navigating to a different instance immediately clears stale YAML from the previous selection — the YAML tab always fetches fresh content.
- **Namespace column visibility:** The Namespace column in provider resource lists and CRD instance lists is shown only when viewing all namespaces (`_all`), keeping single-namespace views clean.

---

## [2.5.0] — 2026-04-06

### New features

#### Security Hub
- **Background scan:** Full and custom scans can now run in the background — start a scan, continue using other panels, and receive a system notification when it completes. A floating pill in the bottom-right corner lets you jump back to Security Hub at any time.
- **Config Issues vs Image CVEs:** Results are now split into two visually distinct panels — a red-tinted "Configuration Issues" card and an orange-tinted "Image Vulnerabilities" card — making it faster to triage each concern type separately.
- **Richer CVE details:** Each image vulnerability now shows the affected image name, package name, and available fix version alongside the CVE ID and severity.
- **Colored kind badges:** Resource kind (Deployment, StatefulSet, Pod, DaemonSet, etc.) is displayed as a colored pill in every result row so you can identify the resource type at a glance.
- **Pod deduplication:** Pods are excluded from scans by default. Because a pod's security posture mirrors its parent controller (Deployment, StatefulSet, etc.), scanning both produces duplicate findings. Pods can be re-included via the Custom Scan kind filter.
- **System node filter:** Nodes and system-namespace workloads (`kube-system`, `kube-node-lease`, `cert-manager`) are hidden by default from scan results. Toggle "Show System" to reveal them.

### Improvements

- **CommandPalette performance:** The palette subscribes to the store with `useShallow` and skips the 27-array resource build while closed, eliminating re-renders during normal app use.
- **UnifiedLogs throughput:** Log chunk callbacks now flush to React state at most every 100 ms via a ref-buffer throttle, reducing render pressure from 50–100 updates/s to ≤10/s on high-verbosity services.

### Fixes

- **macOS app menu:** The macOS menu bar now correctly shows "Podscape" instead of "podscape-electron".
- **Trivy scan JSON:** Trivy outputs pretty-printed multi-line JSON. Newlines in SSE data were truncating the response to a single `{`. The sidecar now compacts Trivy output with `json.Compact` before streaming.
- **Cost API HTML response:** When a port-forward proxy returns `200 OK` with an HTML error page, `probe()` now rejects it via `Content-Type` check. `QueryAllocation` also validates before parsing and returns a clear, actionable error message.
- **Tour overlay:** The X dismiss button now carries `aria-label="Skip tour"` consistent with the visible "Skip" button.
- **Dashboard warning count:** Extracted into a dedicated `useMemo([events])` — no longer recomputed on pod or node list changes.

---

## [2.4.1] — 2026-04-06

### New features

#### Cost Estimation (FinOps)
- **New Cost Panel:** Unified dashboard for Kubecost and OpenCost with provider auto-detection, bar charts for trend analysis, and per-namespace allocation tables.
- **FinOps Sidebar Group:** New navigation group for financial operations, housing the Cost and Allocation views.
- **One-click Installation:** Added "Install Kubecost" and "Install OpenCost" hints to the Helm panel and Cost empty states for one-click setup.
- **Settings Integration:** Redesigned Cost Integration settings section to match Prometheus configuration style, supporting per-context manual URLs.

### Improvements

- **Security Hub:** Enhanced security scanning UI components and progress indicators for a more responsive scanning experience.
- **UI/UX:** Redesigned empty states for Metrics and Cost panels with helpful troubleshooting hints and direct installation links.
- **Events and Settings:** Consistent layout and clarity improvements across the Events resource view and Settings panel.

### Fixes

- **Cost Panel Polish:** Fixed layout inconsistencies, background styling, and added port-forward guidance for local cost provider access.
- **Cluster Store:** Fixed state synchronization issues in `clusterSlice` related to provider detection switching.

---

## [2.4.0] — 2026-04-05

### New features

- **Tour Overlay:** First-time post-connection walkthrough that highlights key panels (Dashboard, Security Hub, Logs, Network, etc.) with a dismissible overlay. Completion state is persisted in `~/.podscape/settings.json`.
- **Warning Event Banner:** Collapsible amber banner on the Dashboard surfaces Warning events for the current namespace at a glance, with a one-click dismiss per context.
- **RestartBadge:** Restart count in the pod list is now a colored badge (green / amber / red) with a direct link to the Debug Pod panel for pods with elevated restart counts.
- **Copy Buttons:** One-click copy added to Pod IP, Host IP, and Node Name in Pod detail; and to key-value headers in ConfigMap detail.
- **Rollout History & Undo:** Deployment detail now shows a full revision history table. Any previous revision can be rolled back to in one click.

### Improvements

- **YAML Apply:** `managedFields` are stripped before server-side apply to prevent `422` errors from field-manager conflicts.
- **YAML UX:** Structured error messages surface the specific line and field that caused an apply failure.
- **Performance:** Reduced re-renders across ResourceList and detail panels; initial JS bundle trimmed by 21% via lazy-loading of heavy panels.
- **Onboarding:** Heavy panels (Security Hub, Network Topology, Cost) are prefetched after the first successful context connection to eliminate loading spinners on first visit.

---

## [2.3.0] — 2026-04-01

### Features

- **CronJob:** Manual trigger support and recent job history displayed in CronJob detail view
- **Helm:** Connection retry logic with cache TTL and UI refresh triggers to handle transient network errors
- **Terminal:** Improved Tab key handling in terminal sessions

### Improvements

- **Node detail:** Node roles now displayed in node detail view
- **CRDs:** Added `customresourcedefinition` as an alias for CRD lookups

### CI

- **Open source:** Repository is now public under the MIT license
- Consolidated all binary releases (including `podscape-mcp`) to the main repo — `podscape-community` archived
- Switched from custom `GH_TOKEN` to built-in `GITHUB_TOKEN` for release publishing
- Added CI workflow — TypeScript build + tests and Go tests run on PRs and pushes to main

---

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

## [1.2.0] — 2025-01-01

- Prometheus-based cluster utilisation charts
- Helm repository browser
- Kubernetes owner-chain visualisation
- Security scan download and `ResourceTable` component
- Kubeconfig onboarding flow
- Prometheus URL auto-detection and per-context persistence

## [1.1.0] — 2025-01-01

- TLS Certificate dashboard
- GitOps panel (initial)
- `PageHeader` component and design system refresh
- `useYAMLEditor` hook; UnifiedLogs and port-forward panels

## [1.0.0] — 2025-01-01

- Initial release: pods, deployments, services, ingresses, configmaps, secrets, nodes, namespaces, CRDs, RBAC, storage, HPA, PDB, events, metrics
- Go sidecar architecture replacing kubectl IPC calls
- Helm release management
- PTY terminal and exec-into-container
- Port-forward manager
- Network topology graph
- Security Hub (kubesec + Trivy)
