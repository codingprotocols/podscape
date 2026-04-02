---
title: MCP Server
nav_order: 7
---

# MCP Server (`podscape-mcp`)

`podscape-mcp` is a standalone binary that exposes your Kubernetes cluster as [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) tools. It lets AI assistants — Claude, Claude Code, Cursor, and any other MCP-compatible client — query and manage your cluster in plain language without requiring `kubectl` knowledge.

The MCP server connects **directly to the Kubernetes API** using your kubeconfig. It is an independent binary that runs alongside (or without) the Podscape desktop app.

---

## Prerequisites

- A kubeconfig file with at least one context configured (default: `~/.kube/config`)
- Go 1.22+ if building from source, or one of the pre-built binaries from GitHub Releases
- The Podscape desktop app is **not** required — `podscape-mcp` talks to the cluster directly

---

## Installation

### Option A — Pre-built binary (recommended)

Pre-built binaries for all platforms are published on every [GitHub Release](https://github.com/codingprotocols/podscape/releases/latest).

**macOS (Apple Silicon):**
```bash
sudo curl -L https://github.com/codingprotocols/podscape/releases/latest/download/podscape-mcp-darwin-arm64 \
  -o /usr/local/bin/podscape-mcp && sudo chmod +x /usr/local/bin/podscape-mcp

# Clear Gatekeeper quarantine (unsigned binary)
xattr -dr com.apple.quarantine /usr/local/bin/podscape-mcp
```

**macOS (Intel):**
```bash
sudo curl -L https://github.com/codingprotocols/podscape/releases/latest/download/podscape-mcp-darwin-amd64 \
  -o /usr/local/bin/podscape-mcp && sudo chmod +x /usr/local/bin/podscape-mcp

xattr -dr com.apple.quarantine /usr/local/bin/podscape-mcp
```

**Linux (amd64):**
```bash
sudo curl -L https://github.com/codingprotocols/podscape/releases/latest/download/podscape-mcp-linux-amd64 \
  -o /usr/local/bin/podscape-mcp && sudo chmod +x /usr/local/bin/podscape-mcp
```

**Windows (amd64):** Download `podscape-mcp-windows-amd64.exe` from the release page and place it somewhere on your `PATH`.

### Option B — Build from source

```bash
cd go-core
go build ./cmd/podscape-mcp/
```

The binary is produced at `go-core/podscape-mcp`.

---

## Configuring your AI assistant

The MCP server communicates over `stdio` and is started automatically by your MCP client — you do not run it manually.

### Claude Code (CLI)

```bash
# Installed binary
claude mcp add --transport stdio podscape -- /usr/local/bin/podscape-mcp

# During development — point at the locally built binary
claude mcp add --transport stdio podscape -- $(pwd)/go-core/podscape-mcp
```

After adding, start a **new Claude Code session** — MCP servers connect on startup:

```bash
claude
```

Verify the server is connected inside the new session:

```
/mcp
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "podscape": {
      "command": "/usr/local/bin/podscape-mcp",
      "args": []
    }
  }
}
```

To use a non-default kubeconfig:

```json
{
  "mcpServers": {
    "podscape": {
      "command": "/usr/local/bin/podscape-mcp",
      "args": ["--kubeconfig", "/path/to/your/kubeconfig"]
    }
  }
}
```

Restart Claude Desktop after editing the config file.

### Cursor

Edit `.cursor/mcp.json` in your project (or the global Cursor MCP config):

```json
{
  "mcpServers": {
    "podscape": {
      "command": "podscape-mcp",
      "args": []
    }
  }
}
```

### Other MCP clients

Any MCP client that supports `stdio` transport works. The server name is `podscape` and the command is the path to the `podscape-mcp` binary with an optional `--kubeconfig` argument.

---

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--kubeconfig` | (see below) | Path to kubeconfig file |

**Kubeconfig resolution order:** `--kubeconfig` flag → `$KUBECONFIG` environment variable → `~/.kube/config`.

---

## Available Tools

`podscape-mcp` exposes 25 tools across three categories.

### Read-only tools (15)

These tools only read from the cluster and never modify state.

#### `list_resources`

List any Kubernetes resource type. Supports all built-in types and any CRD by plural name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource` | string | yes | Resource type: `pods`, `deployments`, `services`, `nodes`, `configmaps`, `secrets`, custom CRD plural names (e.g. `virtualservices`, `ingressroutes`), etc. |
| `namespace` | string | no | Namespace filter; omit for all namespaces |
| `label_selector` | string | no | Label selector, e.g. `app=nginx` or `env=prod,tier=frontend` |
| `limit` | number | no | Max results to return (default 100; set to 0 for unlimited) |

Example input:
```json
{ "resource": "pods", "namespace": "production", "label_selector": "app=api" }
```

#### `get_resource`

Get a single Kubernetes resource by name. Supports built-in types and CRDs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource` | string | yes | Resource type |
| `name` | string | yes | Resource name |
| `namespace` | string | no | Namespace; omit for cluster-scoped resources |

Example input:
```json
{ "resource": "deployments", "name": "api-server", "namespace": "production" }
```

#### `get_resource_yaml`

Get the full YAML manifest of a resource. Returns the same data as `get_resource` but formatted as YAML, equivalent to `kubectl get -o yaml`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource` | string | yes | Resource type |
| `name` | string | yes | Resource name |
| `namespace` | string | no | Namespace; omit for cluster-scoped resources |

#### `get_pod_logs`

Fetch container logs. Output is capped at 512 KB total; a truncation notice is appended if the limit is reached.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pod` | string | yes | Pod name |
| `namespace` | string | yes | Namespace |
| `container` | string | no | Container name (defaults to first container) |
| `tail` | number | no | Number of lines (default 100); ignored when `since_minutes` is set |
| `since_minutes` | number | no | Return logs from the last N minutes (overrides `tail`) |
| `previous` | boolean | no | Fetch logs from the previously terminated container instance (useful for crash-looping pods) |

Example input:
```json
{ "pod": "api-server-7d9f4b-xkp2r", "namespace": "production", "tail": 200 }
```

#### `list_events`

List Kubernetes events sorted by most recent first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | no | Namespace filter; omit for all namespaces |
| `type` | string | no | `Warning` or `Normal`; omit for all types |
| `object_name` | string | no | Filter events for a specific object name |
| `limit` | number | no | Max events to return (default 100) |

Example input:
```json
{ "namespace": "production", "type": "Warning", "limit": 50 }
```

#### `list_contexts`

List all available Kubernetes contexts from the kubeconfig, and report the currently active one.

No parameters required.

Example output:
```json
{
  "contexts": ["prod-cluster", "staging-cluster", "local-kind"],
  "current": "prod-cluster"
}
```

#### `get_current_context`

Return the name of the active Kubernetes context. No parameters required.

#### `list_namespaces`

List all namespaces in the cluster. No parameters required.

#### `helm_list`

List Helm releases in the cluster.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | no | Namespace filter; omit for all namespaces |

#### `helm_status`

Get the full status output of a Helm release.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |

#### `helm_values`

Get the values of a Helm release.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |
| `all` | boolean | no | Include computed/default values (equivalent to `helm get values --all`) |

#### `security_scan`

Run a security posture scan on all pods in a namespace. Checks for: missing `SecurityContext`, privileged containers, containers running as root, missing resource limits, and host network/PID/IPC namespace usage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | yes | Namespace to scan |

Each finding includes: `pod`, `container`, `issue`, and `severity` (`WARN`, `HIGH`, or `CRITICAL`).

Example output:
```json
{
  "namespace": "production",
  "pods_scanned": 12,
  "total_issues": 3,
  "findings": [
    { "pod": "legacy-app-abc123", "container": "app", "issue": "No SecurityContext set", "severity": "WARN" },
    { "pod": "debug-pod", "container": "debug", "issue": "Privileged container", "severity": "CRITICAL" }
  ]
}
```

#### `detect_providers`

Detect installed ingress controllers and service mesh providers in the cluster (Istio, Traefik v2/v3, NGINX Inc, NGINX Community). Uses the Kubernetes discovery API and IngressClass controller fields.

No parameters required.

#### `list_crds`

List all CustomResourceDefinitions installed in the cluster.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `group` | string | no | Filter by API group, e.g. `karpenter.sh` or `traefik.io` |

#### `get_metrics`

Get CPU and memory usage for pods or nodes. Requires `metrics-server` to be installed in the cluster.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | `pods` or `nodes` |
| `namespace` | string | no | Namespace filter for pods; omit for all namespaces |

---

### Mutating tools (6)

These tools modify cluster state. They are marked non-destructive (except `delete_resource`) per the MCP hint annotations in the server.

#### `scale_resource`

Scale a deployment or statefulset to a desired replica count.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | `deployment` or `statefulset` |
| `name` | string | yes | Resource name |
| `namespace` | string | yes | Namespace |
| `replicas` | number | yes | Desired replica count (must be >= 0) |

#### `delete_resource`

Delete a Kubernetes resource. This tool is marked destructive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | Resource kind, e.g. `pod`, `deployment`, `service` |
| `name` | string | yes | Resource name |
| `namespace` | string | yes | Namespace |

#### `rollout_restart`

Trigger a rolling restart of a deployment, daemonset, or statefulset by patching the pod template annotation with the current timestamp.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | `deployment`, `daemonset`, or `statefulset` |
| `name` | string | yes | Resource name |
| `namespace` | string | yes | Namespace |

#### `rollout_undo`

Roll back a deployment to a previous revision.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | `deployment` (currently the only supported kind) |
| `name` | string | yes | Resource name |
| `namespace` | string | yes | Namespace |
| `revision` | number | no | Target revision number; omit or set to `0` for the previous revision |

#### `apply_yaml`

Apply a Kubernetes YAML manifest using server-side apply. Equivalent to `kubectl apply --server-side`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `yaml` | string | yes | The full YAML manifest content |

#### `helm_rollback`

Roll back a Helm release to a previous revision.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |
| `revision` | number | no | Target revision; omit or set to `0` for the previous revision |

---

### Diagnostic aggregation tools (4)

These tools bundle multiple API calls into a single response to reduce the number of round-trips needed for common diagnostic workflows.

#### `pod_summary`

Get a combined view of a pod's status, container states, recent events, and last N log lines — everything needed to diagnose a failing pod in one call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pod` | string | yes | Pod name |
| `namespace` | string | yes | Namespace |
| `tail` | number | no | Log lines per container (default 50) |
| `previous` | boolean | no | Fetch logs from the previously terminated container instance |

Returns: `phase`, `conditions`, `containers` (with state/reason/message per container), `events`, and `container_logs` (map of container name → log output).

#### `cluster_health`

Get a one-call cluster health overview: node ready/total counts, pod counts by phase (Running, Pending, Failed, etc.), and Warning events from the last hour.

No parameters required.

Example output:
```json
{
  "nodes": { "ready": 3, "total": 3 },
  "pods": { "Running": 47, "Pending": 2, "Succeeded": 5 },
  "warning_events": [
    {
      "namespace": "production",
      "reason": "BackOff",
      "object": "Pod/api-server-xyz",
      "message": "Back-off restarting failed container",
      "count": 12,
      "lastSeen": "2026-04-02T10:15:00Z"
    }
  ]
}
```

Warning events are capped at 50 entries; a `warning_events_truncated: true` field is added when the cap is reached.

#### `list_failing_pods`

List all pods that are not in `Running` or `Succeeded` state, plus any `Running` pods with containers in a `Waiting` or not-ready state. Includes phase, reason, and per-container failure details.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | no | Namespace filter; omit for all namespaces |

Returns `total_failing` and an array of pods, each with `name`, `namespace`, `phase`, `reason`, `message`, `age`, and a `containers` array with `state`, `reason`, `message`, and `restarts` per failing container.

#### `get_resource_events`

Get Kubernetes events for a specific named resource — equivalent to the Events section of `kubectl describe`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | Resource kind, e.g. `Pod`, `Deployment`, `Node`, `Service` |
| `name` | string | yes | Resource name |
| `namespace` | string | no | Namespace; omit for cluster-scoped resources |

---

## Authentication

`podscape-mcp` authenticates with the Kubernetes API using the credentials already present in your kubeconfig — exactly as `kubectl` does. This includes certificate-based auth, token-based auth, OIDC, exec plugins (e.g. `aws eks get-token`), and any other provider supported by client-go.

The MCP server does **not** connect to the Podscape desktop app or its sidecar. There is no separate token or shared secret to configure.

The permissions available to the MCP server are the same as those of the user or service account referenced by the active kubeconfig context. If your kubeconfig user only has read access to certain namespaces, the MCP tools will reflect that — they will return API errors for operations outside that scope.

---

## Example workflows

### Diagnose a failing pod in production

Ask your AI assistant:

> "One of my pods in the production namespace is crash-looping. Can you find it and tell me what's wrong?"

The assistant will likely call:
1. `list_failing_pods` with `namespace=production` to find the pod
2. `pod_summary` with the pod name and namespace to get status, events, and logs in one shot

---

### Check cluster health before a deployment

Ask your AI assistant:

> "Give me a quick health check of the cluster before I push the release."

The assistant will call:
1. `cluster_health` to get node/pod counts and recent Warning events
2. Optionally `list_failing_pods` for a full list of unhealthy pods

---

### Roll back a broken Helm release

Ask your AI assistant:

> "The last deploy of the checkout-service Helm release broke something. Roll it back to the previous revision."

The assistant will likely call:
1. `helm_status` with `release=checkout-service` and the relevant namespace to confirm the current state
2. `helm_rollback` with `release=checkout-service` and `revision=0` (previous revision)
3. `helm_status` again to confirm the rollback succeeded

---

## Troubleshooting

### "error building kubeconfig from …"

The kubeconfig file does not exist at the expected path, or the path passed via `--kubeconfig` is wrong. Check that the file exists and is readable. If you use a non-standard path, set `$KUBECONFIG` or pass `--kubeconfig` explicitly.

### "connection refused" or API server unreachable

The cluster referenced by the active context is not reachable. Verify with `kubectl cluster-info`. Common causes: VPN not connected, cluster is down, or the kubeconfig context points to a stale server address.

### Tool calls return permission errors

The kubeconfig user does not have RBAC permission for the requested operation. Review the cluster role bindings for your user, or switch to a context with sufficient privileges.

### "metrics unavailable (is metrics-server installed?)"

The `get_metrics` tool requires the Kubernetes Metrics Server to be running in the cluster. Install it with:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### MCP server not appearing in the AI assistant

- Confirm the binary path in the MCP client config is correct and the binary is executable (`chmod +x`).
- On macOS, if Gatekeeper blocks the binary, run `xattr -dr com.apple.quarantine /usr/local/bin/podscape-mcp`.
- For Claude Desktop, restart the app after editing the config file.
- For Claude Code, start a new session after running `claude mcp add` — MCP servers connect on session startup, not mid-session.
- Run the binary manually to confirm it starts without errors: `/usr/local/bin/podscape-mcp --help`

### Context mismatch — tools operate on the wrong cluster

The MCP server reads the active context from your kubeconfig at startup. If you switch contexts with `kubectl config use-context` after the server is already running, you need to restart the MCP client session so the server reinitialises with the new context.
