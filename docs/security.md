# Security Hub

The Security Hub provides a unified interface for auditing cluster security, combining a built-in scanner engine with optional Trivy and Kubesec integrations.

---

## Scanning Engines

### 1. Built-in Scanner Engine (`src/renderer/utils/scanner/`)

A rule-based engine that runs entirely in the renderer against the already-loaded resource cache — no network call required.

- Rules are composable functions: `validate(resource) → Issue[]`
- Covers common misconfigurations: missing resource limits, privileged containers, default service accounts, missing probes, etc.
- Results are available immediately when opening the Security Hub (no scan trigger needed).

### 2. Static Configuration Analysis — Kubesec

- **Engine**: [Kubesec.io](https://kubesec.io/) — integrated as a Go package in the sidecar.
- **Endpoint**: `POST /security/kubesec/batch`
- **Concurrency**: Worker pool with 8 concurrent goroutines for high-throughput batch scoring.
- **Scoring**: Kubesec raw scores are normalized to `critical` (< 0), `warning` (0–3), and `info` (> 3) levels.

### 3. Dynamic Image Vulnerability Scanning — Trivy

- **Engine**: [Aqua Security Trivy](https://github.com/aquasecurity/trivy) — invoked via `os/exec` from the sidecar.
- **Endpoint**: `POST /security/trivy/images` (SSE stream)
- **Deduplication**: Images are deduplicated cluster-wide before scanning — each unique tag is scanned only once regardless of how many pods use it.
- **SSE Streaming**: Scan progress (`progress` events) and the final report (`result` event) are streamed in real-time so the UI can display granular output during long scans.

---

## Custom Scan Options

The Security Hub supports scoped scans to reduce noise:

- **Namespace filter**: limit scanning to one or more namespaces.
- **Kind filter**: scan only specific resource types (e.g. Pods, Deployments).
- **Engine toggles**: run any combination of the built-in engine, Kubesec, and Trivy independently.

---

## UI Features

| Feature | Description |
|---|---|
| Flat / grouped view | Toggle between a flat resource list and grouping by namespace |
| System namespace filter | Auto-hides `kube-system`, `kube-node-lease`, etc.; toggle to reveal |
| Severity filter tabs | Filter results to Critical-only or Warning-only |
| Sortable columns | Sort by resource name, namespace, kind, config issues, CVE count, or combined score |
| Navigate to resource | Click the `↗` button on any row to open that resource's detail panel directly |
| Export | Download filtered results as **CSV** or **JSON** for external reporting |

---

## Score Model

Each resource in the table receives a combined risk score:

| Score | Indicator | Condition |
|---|---|---|
| 2 — Critical | Red dot | Has `CRITICAL` or `HIGH` CVEs from Trivy |
| 1 — Warning | Amber dot | Has config issues from the engine or Kubesec |
| 0 — OK | Grey dot | No issues found |

---

## Navigate to Resource

Every row in the Security Hub has a `↗` icon button (visible on hover) that calls `navigateToResource(kind, name, namespace)`. This:

1. Switches the active section in the left sidebar to the resource's kind (e.g. Pods, Deployments).
2. Loads the resource list for that section.
3. Selects and opens the matched resource's detail panel.

This is the same navigation action used by the Ownership Chain tree visualization.
