---
title: Home
layout: home
nav_order: 1
---

# Podscape Documentation

Welcome to the Podscape documentation. This folder contains detailed technical guides and architectural overviews for the project.

## Contents

- [**Architecture Overview**](architecture.md) — Three-process model, Go sidecar internals, provider detection, data flow, and startup sequence.
- [**API Reference (Sidecar)**](api.md) — All HTTP endpoints exposed by the Go sidecar on `localhost:5050`.
- [**Security Hub**](security.md) — Dynamic image scanning (Trivy), static config audit (Kubesec), and Security Hub UI.
- [**Development Guide**](development.md) — Setup, build, test, and distribution instructions.
- [**Features Guide**](features-guide.md) — Command palette, production context protection, unified logs, connectivity tester, pod diagnostics, and auto-updater.
- [**MCP Server**](mcp-server.md) — Install `podscape-mcp`, configure Claude/Cursor, and reference for all 25 tools.
- [**Keyboard Shortcuts**](keyboard-shortcuts.md) — All shortcuts and the complete command palette section index.
- [**Troubleshooting**](troubleshooting.md) — Sidecar issues, RBAC denied sections, build fixes, and recovery procedures.

---

## Navigation

Press **⌘K** (macOS) or **Ctrl+K** (Windows/Linux) to open the command palette — search any resource type, panel, or section by name.

Full keyboard shortcut reference: [Keyboard Shortcuts](keyboard-shortcuts.md)

---

## Quick Start

```bash
# 1. Install Node dependencies
npm install

# 2. Build the Go sidecar (required before first dev run)
cd go-core && go build ./cmd/podscape-core/ && cd ..

# 3. Start in dev mode with hot reload
npm run dev
```

## Feature Overview (v2.7.0)


| Feature | Description |
|---|---|
| Resource Browser | 28 built-in Kubernetes resource types with live informer-backed cache |
| RBAC-aware startup | Concurrent `SelfSubjectAccessReview` probe at startup; denied sections show an "Access denied" banner instead of errors |
| Modular Architecture | Refactored renderer shell (Layout/Router/Overlay) and granular type system for better maintainability |

| Go Sidecar | Standalone `podscape-core` binary — HTTP server split across 16 handler files, shared informer cache, RBAC probe, and centralized resource metadata (`k8sutil`) |

| Service Mesh Support | Istio, Traefik v2/v3, NGINX Inc, NGINX Community — auto-detected per cluster via API group discovery |
| HPA v2 Metrics | Full `autoscaling/v2` metric display: resource, container-resource, Pods, External targets vs current |
| CronJobs | Manual trigger support (instantiate Job from CronJob) and recent job history |
| Prometheus Charts | CPU, memory, and network time-series charts in Pod / Node / Deployment detail panels |
| Helm Management | List releases, inspect values, view history, rollback, and browse/install from Helm repositories; connection retry logic |
| Security Hub | Kubesec config audit + Trivy image CVE scanner; config/CVE split panels, kind badges, background scan with system notification, pod deduplication; export as CSV / JSON |
| Port Forwarding | One-click tunnel setup with auto port detection and live status |
| Container Shell | PTY exec-into-container via xterm.js |
| Log Streaming | Real-time WebSocket log streaming with search and fullscreen mode |
| Network Topology | Force-directed graph of pod-to-service relationships with cross-namespace connectivity testing |
| TLS Dashboard | Cluster-wide certificate inventory with expiry tracking |
| Cost Estimation | Kubecost / OpenCost integration with per-namespace allocation tracking |
| GitOps Panel | Argo CD / Flux resource overview |
| Debug Pod | Launch an ephemeral debug container on any node |
| Node Ops | Cordon, uncordon, and drain nodes with safety checks |
| Owner Chain | Interactive tree visualization showing ancestor and descendant resources |
| MCP Server | `podscape-mcp` — expose your cluster as tools for AI assistants (Claude, Cursor, etc.) |
| Kubeconfig Onboarding | Guided setup when no kubeconfig is detected on first launch |
| Command Palette | Cmd+K / Ctrl+K fuzzy search across all 50+ sections and resources |
| Production Context Protection | Red border + banner when connected to a context marked as production in Settings |
| Unified Log Streaming | Aggregate real-time logs from multiple pods simultaneously with per-pod color coding and search |
| Connectivity Tester | Pod-to-pod / pod-to-service network diagnostics with curl, netcat, and ping; automated DNS→TCP→HTTP flow |
| Auto-Updater | In-app update checks with download progress and one-click install |
