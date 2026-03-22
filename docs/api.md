# API Reference — Go Sidecar

The Go sidecar listens on `127.0.0.1:5050` by default. All endpoints except `/health` require the `X-Podscape-Token` header.

```
X-Podscape-Token: <token>   # injected automatically by checkedSidecarFetch
```

### RBAC denial header

Resource-list endpoints (`/pods`, `/deployments`, `/crds`, etc.) always return `200 OK`. When the current user lacks `list`/`watch` permission for a resource, the response body is `[]` and the following header is set:

```
X-Podscape-Denied: true
```

The main-process `getResources` IPC handler detects this header and throws `RBACDeniedError` so the renderer store can differentiate "permission denied" from a genuinely empty namespace. The `deniedSections` Zustand store field tracks which sections are denied; `ResourceList` renders an "Access denied" banner for them.

### HPA version

`/hpas` returns `autoscaling/v2` objects (requires Kubernetes ≥ 1.23). The response includes `spec.metrics` and `status.currentMetrics` arrays used by `HPADetail` to render target-vs-current metric comparisons.

---

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `200 OK` when informers are synced (or in no-kubeconfig mode). Returns `503` while syncing. No auth required. |

---

## Workloads

| Method | Path | Description |
|---|---|---|
| GET | `/nodes` | All cluster nodes |
| GET | `/namespaces` | All namespaces |
| GET | `/pods` | Pods (filter with `?namespace=`) |
| GET | `/deployments` | Deployments |
| GET | `/daemonsets` | DaemonSets |
| GET | `/statefulsets` | StatefulSets |
| GET | `/replicasets` | ReplicaSets |
| GET | `/jobs` | Jobs |
| GET | `/cronjobs` | CronJobs |
| GET | `/hpas` | HorizontalPodAutoscalers |
| GET | `/pdbs` | PodDisruptionBudgets |

## Networking

| Method | Path | Description |
|---|---|---|
| GET | `/services` | Services |
| GET | `/ingresses` | Ingresses |
| GET | `/ingressclasses` | IngressClasses |
| GET | `/networkpolicies` | NetworkPolicies |
| GET | `/endpoints` | Endpoints |

## Config & Storage

| Method | Path | Description |
|---|---|---|
| GET | `/configmaps` | ConfigMaps |
| GET | `/secrets` | Secrets (values masked server-side) |
| GET | `/pvcs` | PersistentVolumeClaims |
| GET | `/pvs` | PersistentVolumes |
| GET | `/storageclasses` | StorageClasses |

## RBAC

| Method | Path | Description |
|---|---|---|
| GET | `/serviceaccounts` | ServiceAccounts |
| GET | `/roles` | Roles |
| GET | `/clusterroles` | ClusterRoles |
| GET | `/rolebindings` | RoleBindings |
| GET | `/clusterrolebindings` | ClusterRoleBindings |
| GET | `/crds` | CustomResourceDefinitions |
| GET | `/events` | Events |

---

## Kubernetes Operations

| Method | Path | Body / Params | Description |
|---|---|---|---|
| POST | `/scale` | `{kind, name, namespace, replicas}` | Scale a workload |
| POST | `/delete` | `{kind, name, namespace}` | Delete a resource |
| POST | `/rollout/restart` | `{kind, name, namespace}` | Rollout restart |
| GET | `/rollout/history` | `?kind=&name=&namespace=` | Rollout revision history |
| POST | `/rollout/undo` | `{kind, name, namespace, revision?}` | Rollout undo |
| GET | `/getYAML` | `?kind=&name=&namespace=` | Fetch resource manifest as YAML |
| POST | `/apply` | Raw YAML body | Apply a manifest (kubectl apply equivalent) |
| GET | `/secret/value` | `?name=&namespace=&key=` | Reveal a single secret value |

## Context Management

| Method | Path | Description |
|---|---|---|
| GET | `/config/contexts` | List all kubeconfig contexts |
| GET | `/config/current-context` | Active context name |
| POST | `/config/switch` | Switch active context `{context}` |

---

## Metrics

| Method | Path | Description |
|---|---|---|
| GET | `/metrics/pods` | Pod CPU / memory (requires metrics-server) |
| GET | `/metrics/nodes` | Node CPU / memory (requires metrics-server) |

---

## Prometheus

| Method | Path | Description |
|---|---|---|
| GET | `/prometheus/status` | Auto-discover Prometheus via k8s service proxy or manual URL |
| POST | `/prometheus/query_range_batch` | Batch PromQL range queries with 30s result cache |

**Batch request body:**
```json
[
  { "query": "rate(container_cpu_usage_seconds_total[5m])", "label": "CPU" },
  { "query": "container_memory_working_set_bytes", "label": "Memory" }
]
```

**Batch response:**
```json
[
  { "label": "CPU", "timestamps": [1700000000, ...], "values": [0.02, ...] },
  { "label": "Memory", "timestamps": [...], "values": [...] }
]
```

---

## Helm

| Method | Path | Description |
|---|---|---|
| GET | `/helm/list` | Installed Helm releases |
| GET | `/helm/status` | Release status `?name=&namespace=` |
| GET | `/helm/values` | Release values `?name=&namespace=` |
| GET | `/helm/history` | Release history `?name=&namespace=` |
| POST | `/helm/rollback` | Roll back a release |
| POST | `/helm/uninstall` | Uninstall a release |
| GET | `/helm/repos` | List configured Helm repositories |
| GET | `/helm/repos/search` | Search charts `?q=&repo=&limit=&offset=` |
| GET | `/helm/repos/versions` | Chart versions `?chart=&repo=` |
| GET | `/helm/repos/values` | Default values for a chart version |
| POST | `/helm/repos/refresh` | Re-fetch repo indexes (SSE stream) |
| POST | `/helm/install` | Install a chart (SSE stream) |

**Install body:**
```json
{
  "chart": "nginx",
  "repo": "bitnami",
  "version": "15.0.0",
  "name": "my-nginx",
  "namespace": "default",
  "values": "replicaCount: 2\n"
}
```

---

## Owner Chain

| Method | Path | Description |
|---|---|---|
| GET | `/owner-chain` | Traverses owner references up (ancestors) and down (descendants) |

**Query params:** `?kind=Pod&name=my-pod&namespace=default`

**Response:**
```json
{
  "ancestors": [
    { "kind": "ReplicaSet", "name": "my-deploy-abc", "namespace": "default", "uid": "...", "found": true },
    { "kind": "Deployment", "name": "my-deploy",     "namespace": "default", "uid": "...", "found": true }
  ],
  "descendants": {
    "Pod": []
  }
}
```

---

## Security

| Method | Path | Description |
|---|---|---|
| POST | `/security/scan` | Full audit: engine + Trivy + Kubesec (SSE stream) |
| POST | `/security/kubesec` | Single resource Kubesec audit |
| POST | `/security/kubesec/batch` | Batch Kubesec audit (worker pool, 8 concurrent) |
| POST | `/security/trivy/images` | Trivy image scan for selected images (SSE stream) |

**SSE events** (for streaming endpoints):
- `progress` — real-time log lines
- `result` — final JSON payload
- `error` — error message

---

## Topology

| Method | Path | Description |
|---|---|---|
| GET | `/topology` | Cluster topology graph (nodes → pods → services) |

---

## Debug Pod

| Method | Path | Description |
|---|---|---|
| POST | `/debugpod/create` | Launch an ephemeral debug pod on a specified node |

---

## Real-time (WebSocket)

| Path | Description |
|---|---|
| `ws://127.0.0.1:5050/logs` | Real-time container log stream |
| `ws://127.0.0.1:5050/exec` | Interactive PTY exec into a container |
| `ws://127.0.0.1:5050/portforward` | Port-forward lifecycle events (ready / error / exit) |
