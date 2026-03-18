# Changelog

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
