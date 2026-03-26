# Podscape Documentation

Welcome to the Podscape documentation. This folder contains detailed technical guides and architectural overviews for the project.

## Contents

- [**Architecture Overview**](architecture.md) — Three-process model, Go sidecar internals, provider detection, data flow, and startup sequence.
- [**API Reference (Sidecar)**](api.md) — All HTTP endpoints exposed by the Go sidecar on `localhost:5050`.
- [**Security Hub**](security.md) — Dynamic image scanning (Trivy), static config audit (Kubesec), and Security Hub UI.
- [**Development Guide**](development.md) — Setup, build, test, and distribution instructions.

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

## Feature Overview (v2.2.2)

| Feature | Description |
|---|---|
| Resource Browser | 27+ Kubernetes resource types with live informer-backed cache |
| RBAC-aware startup | Concurrent `SelfSubjectAccessReview` probe at startup; denied sections show an "Access denied" banner instead of errors |
| Go Sidecar | Standalone `podscape-core` binary — HTTP server split across 12 handler files, shared informer cache, RBAC probe |
| Service Mesh Support | Istio, Traefik v2/v3, NGINX Inc, NGINX Community — auto-detected per cluster via API group discovery |
| HPA v2 Metrics | Full `autoscaling/v2` metric display: resource, container-resource, Pods, External targets vs current |
| Prometheus Charts | CPU, memory, and network time-series charts in Pod / Node / Deployment detail panels |
| Helm Management | List releases, inspect values, view history, rollback, and browse/install from Helm repositories |
| Security Hub | Unified kubesec config audit + Trivy image CVE scanner; export as CSV / JSON |
| Port Forwarding | One-click tunnel setup with auto port detection and live status |
| Container Shell | PTY exec-into-container via xterm.js |
| Log Streaming | Real-time WebSocket log streaming with search and fullscreen mode |
| Network Topology | Force-directed graph of pod-to-service relationships with cross-namespace connectivity testing |
| TLS Dashboard | Cluster-wide certificate inventory with expiry tracking |
| GitOps Panel | Argo CD / Flux resource overview |
| Debug Pod | Launch an ephemeral debug container on any node |
| Owner Chain | Interactive tree visualization showing ancestor and descendant resources |
| MCP Server | `podscape-mcp` — expose your cluster as tools for AI assistants (Claude, Cursor, etc.) |
| Kubeconfig Onboarding | Guided setup when no kubeconfig is detected on first launch |
