---
title: Security Hub
nav_order: 4
---

# Security Hub

The Security Hub provides a unified interface for auditing cluster security, combining a built-in scanner engine with optional Trivy and Kubesec integrations.

---

## Scanning Engines

### 1. Built-in Scanner Engine (`src/renderer/utils/scanner/`)

A rule-based engine that runs entirely in the renderer against the already-loaded resource cache — no network call required.

- Rules are composable functions: `validate(resource) → Issue[]`
- Results are available immediately when opening the Security Hub (no scan trigger needed).

Built-in rules (`src/renderer/utils/scanner/bestPracticeRules.ts`):

| Rule | Check |
|------|-------|
| Missing Resource Limits | Containers without CPU or Memory limits |
| Latest Image Tag | Containers using the `:latest` tag |
| Missing Liveness Probe | Containers without a liveness probe |
| Missing Readiness Probe | Containers without a readiness probe |
| Sensitive Env Variable | Plain-text environment variables with names matching `PASSWORD`, `SECRET`, `TOKEN`, `KEY`, etc. |

### 2. Static Configuration Analysis — Kubesec

- **Engine**: [Kubesec.io](https://kubesec.io/) — integrated as a Go package in the sidecar.
- **Endpoint**: `POST /security/kubesec/batch`
- **Concurrency**: Worker pool with 8 concurrent goroutines for high-throughput batch scoring.
- **Scoring**: Kubesec raw scores are normalized to `critical` (< 0), `warning` (0–3), and `info` (> 3) levels.

### 3. Dynamic Image Vulnerability Scanning — Trivy

- **Engine**: [Aqua Security Trivy](https://github.com/aquasecurity/trivy) — invoked via `os/exec` from the sidecar.
- **Endpoint**: `POST /security/trivy/images` (SSE stream)
- **Deduplication**: Images are deduplicated cluster-wide before scanning — each unique tag is scanned only once regardless of how many pods use it.
- **SSE Streaming**: Scan progress (`progress` events) and the final report (`result` event) are streamed in real-time. The sidecar compacts Trivy's pretty-printed JSON with `json.Compact` before transmission so the JSON is sent as a single-line SSE payload and does not interfere with SSE message boundaries.

---

## Custom Scan Options

The Security Hub supports scoped scans to reduce noise:

- **Namespace filter**: limit scanning to one or more namespaces.
- **Kind filter**: scan only specific resource types (e.g. Pods, Deployments).
- **Engine toggles**: run any combination of the built-in engine, Kubesec, and Trivy independently.

> **Pod deduplication:** Pods are excluded from scans by default to avoid duplicate resource findings, because a pod's security posture is usually represented by its parent controller (Deployment, StatefulSet, DaemonSet, etc.). This does **not** reduce Trivy image coverage: images referenced by included controllers are still discovered and scanned once cluster-wide via image deduplication. To include pods explicitly, select "Pod" in the kind filter of a custom scan.

---

## Background Scans

Full and custom scans can run in the background while you use other panels:

1. Click the **▾** arrow next to the Full Scan button and choose **Run in Background**.
2. A floating pill appears in the bottom-right corner of every screen while the scan is running. Click it to jump back to Security Hub.
3. When the scan finishes, a **system notification** is delivered with a summary (number of affected resources, or "No issues found").

Background scans require notification permission; the app requests it automatically on first background scan.

---

## UI Features

| Feature | Description |
|---|---|
| Flat / grouped view | Toggle between a flat resource list and grouping by namespace |
| System filter | Auto-hides `kube-system`, `kube-node-lease`, `cert-manager`, and Node resources; toggle "Show System" to reveal |
| Colored kind badges | Every row shows a colored pill (Deployment, StatefulSet, DaemonSet, etc.) for instant resource-type identification |
| Config / CVE panels | Expanded rows display a red "Configuration Issues" card and an orange "Image Vulnerabilities" card separately |
| CVE detail | Each vulnerability shows the image name, package name, fix version, CVE ID, and severity |
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
