---
title: Keyboard Shortcuts
nav_order: 8
---

# Keyboard Shortcuts

This page is the exhaustive reference for every keyboard shortcut in Podscape. Shortcuts are discovered directly from source code and reflect the current implementation.

**Platform notation used in this document:**

- `⌘` — Command key (macOS only)
- `Ctrl` — Control key (Windows / Linux)
- Where a shortcut says `⌘/Ctrl`, use `⌘` on macOS and `Ctrl` on Windows/Linux.

---

## Global Shortcuts

These shortcuts are active anywhere in the application, regardless of which section is open.

| Shortcut | Platform | Action |
|----------|----------|--------|
| `⌘` `K` | macOS | Open / close the Command Palette |
| `Ctrl` `K` | Windows / Linux | Open / close the Command Palette |

---

## Command Palette

Opened with `⌘K` / `Ctrl+K`, the Command Palette lets you jump to any section or navigate directly to a specific resource by name.

### Navigation keys (while the palette is open)

| Key | Action |
|-----|--------|
| Type to search | Filter sections and resources by name or keyword |
| `↓` Arrow Down | Move selection down through results |
| `↑` Arrow Up | Move selection up through results |
| `Enter` | Jump to the selected section or open the selected resource |
| `Escape` | Close the palette without navigating |

### How search works

The palette searches two pools simultaneously:

1. **Sections** — matched against the section label, its internal ID, and a set of topic keywords (see table below). Up to 5 section results are shown.
2. **Resources** — matched against the `metadata.name` of every resource that is already loaded in the current context. Up to 12 resource results are shown.

Selecting a section result navigates to that section. Selecting a resource result switches to the correct namespace and section and opens the resource's detail panel.

---

## Section Quick-Jump Reference

The table below lists every section searchable through the Command Palette, along with all keywords that will surface it in results.

| Section Label | Internal ID | Search Keywords |
|---------------|-------------|-----------------|
| Dashboard | `dashboard` | home, overview |
| Pods | `pods` | workload |
| Deployments | `deployments` | workload |
| DaemonSets | `daemonsets` | workload |
| StatefulSets | `statefulsets` | workload |
| ReplicaSets | `replicasets` | workload |
| Jobs | `jobs` | workload, batch |
| CronJobs | `cronjobs` | workload, batch, schedule |
| HPAs | `hpas` | autoscaling, scale |
| PodDisruptionBudgets | `pdbs` | pdb, disruption |
| Services | `services` | network, svc |
| Ingresses | `ingresses` | network, routing |
| Ingress Classes | `ingressclasses` | network |
| Network Policies | `networkpolicies` | network, policy |
| Endpoints | `endpoints` | network |
| ConfigMaps | `configmaps` | config, cm |
| Secrets | `secrets` | config, credentials |
| PVCs | `pvcs` | storage, volume, persistent |
| PVs | `pvs` | storage, volume, persistent |
| Storage Classes | `storageclasses` | storage |
| Service Accounts | `serviceaccounts` | rbac, auth |
| Roles | `roles` | rbac, auth, permission |
| Cluster Roles | `clusterroles` | rbac, auth |
| Role Bindings | `rolebindings` | rbac, auth |
| Cluster Role Bindings | `clusterrolebindings` | rbac, auth |
| Nodes | `nodes` | cluster, infrastructure |
| Namespaces | `namespaces` | cluster |
| CRDs | `crds` | cluster, custom, resources |
| Events | `events` | observe, logs, warning |
| Metrics | `metrics` | observe, cpu, memory, usage |
| Unified Logs | `unifiedlogs` | observe, logs, stream |
| Port Forwards | `portforwards` | network, tunnel, forward |
| Network Map | `network` | topology, visualize |
| Connectivity | `connectivity` | test, ping, curl |
| Debug Pods | `debugpod` | debug, shell, exec |
| Security Hub | `security` | scan, trivy, kubesec, vulnerability |
| TLS Certificates | `tls` | cert, ssl, x509, expiry |
| GitOps | `gitops` | flux, argo, argocd, kustomize, gitops |
| Cost & Waste | `costview` | cost, billing, efficiency, waste, resources |
| Helm Charts | `helm` | helm, releases, charts, package |
| Settings | `settings` | config, preferences, theme |

---

## Resource List

The resource list table is the main panel for all Kubernetes resource types (pods, deployments, services, etc.). The following shortcuts are active when focus is not inside a text input or textarea.

| Key | Action |
|-----|--------|
| `Escape` | Close an open context menu; or close an open YAML viewer / loading spinner; or close an open delete confirmation dialog; or close an open port-forward dialog; or close an open scale dialog |
| `Delete` | Open the bulk-delete confirmation for the currently selected rows (if one or more rows are selected), or open the single-resource delete confirmation for the highlighted resource |
| `Backspace` | Same as `Delete` — opens bulk-delete or single-resource delete confirmation |

**Note:** `Delete` and `Backspace` only trigger when focus is outside any `<input>` or `<textarea>` element.

---

## Pod Detail Panel

The following shortcuts are active when a pod is selected and its detail panel is open. They do not fire when focus is inside a text input or textarea.

| Shortcut | Platform | Action |
|----------|----------|--------|
| `⌘` `T` | macOS | Open an interactive shell (exec) into the selected container |
| `Ctrl` `T` | Windows / Linux | Open an interactive shell (exec) into the selected container |
| `⌘` `L` | macOS | Switch to the Logs tab and enter fullscreen log view |
| `Ctrl` `L` | Windows / Linux | Switch to the Logs tab and enter fullscreen log view |
| `⌘` `D` | macOS | Close fullscreen log view (only when log fullscreen is active) |
| `Ctrl` `D` | Windows / Linux | Close fullscreen log view (only when log fullscreen is active) |
| `Escape` | All | Close fullscreen log view (when fullscreen is active) |

---

## Exec / Terminal Panel

The exec panel is the full-screen terminal that opens when you shell into a container.

| Shortcut | Platform | Action |
|----------|----------|--------|
| `⌘` `D` | macOS | Close the exec panel (only fires when focus is not in an input or textarea) |
| `Ctrl` `D` | Windows / Linux | Close the exec panel (only fires when focus is not in an input or textarea) |
| `Escape` | All | Close the exec panel (only when the file-transfer sub-panel is not open) |
| `Tab` | All | Sent to the PTY as a tab-completion character (browser focus-navigation is suppressed) |
| `Enter` (in path input) | All | Submit a file upload or download when the remote path field is focused |

**Note:** `⌘D` / `Ctrl+D` is shown in the exec panel header as a reminder hint.

---

## Connectivity Tester

The Connectivity Tester panel (`connectivity` section) supports one keyboard shortcut.

| Shortcut | Platform | Action |
|----------|----------|--------|
| `⌘` `Enter` | macOS | Run the connectivity test (when the form is valid and ready to run) |
| `Ctrl` `Enter` | Windows / Linux | Run the connectivity test (when the form is valid and ready to run) |

---

## Delete Confirmation Dialog

When a resource delete confirmation dialog is open and you have typed the resource name into the confirmation field:

| Key | Action |
|-----|--------|
| `Enter` | Confirm and execute the deletion (only when the typed name matches the resource name) |

---

## Notes

- All `⌘/Ctrl` shortcuts use `e.metaKey` on macOS and `e.ctrlKey` on Windows/Linux — this is detected automatically via `src/renderer/utils/platform.ts`.
- Shortcuts that require focus to be outside a text field check `document.activeElement.tagName !== 'INPUT'` and `!== 'TEXTAREA'` before firing.
- The terminal inside ExecPanel uses xterm.js. Standard terminal key sequences (Ctrl+C, Ctrl+Z, arrow history, etc.) are handled natively by the PTY and are not listed here as they are shell-level, not app-level, shortcuts.
