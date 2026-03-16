# Podscape Documentation

Welcome to the Podscape documentation. This folder contains detailed technical guides and architectural overviews for the project.

## Contents

- [**Architecture Overview**](architecture.md) — Three-process model, Go sidecar internals, data flow, and startup sequence.
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

## Feature Overview (v1.2.0)

| Feature | Description |
|---|---|
| Resource Browser | 27+ Kubernetes resource types with live informer-backed cache |
| Go Sidecar | Standalone `podscape-core` binary — no local `kubectl` or `helm` CLI required |
| Ownership Chain | Interactive tree visualization showing ancestor and descendant resources; click any node to navigate |
| Prometheus Charts | CPU, memory, and network time-series charts in Pod / Node / Deployment detail panels |
| Helm Repo Browser | Browse, search, and install charts from configured Helm repositories |
| Security Hub | Unified kubesec config audit + Trivy image CVE scanner; export as CSV / JSON |
| Port Forwarding | One-click tunnel setup with auto port detection and live status |
| Container Shell | PTY exec-into-container via xterm.js |
| Log Streaming | Real-time WebSocket log streaming with search and fullscreen mode |
| Kubeconfig Onboarding | Guided setup when no kubeconfig is detected on first launch |
| Splash Screen | Kubernetes-themed animated loading screen shown during sidecar startup |
