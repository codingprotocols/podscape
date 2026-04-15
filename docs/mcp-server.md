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

## Safety gates

Three destructive tools require an explicit `confirm=true` parameter to execute. Calling them **without** `confirm=true` returns a preview of what would be affected — no cluster state is changed.

| Tool | Preview shows |
|------|--------------|
| `delete_resource` | Kind, name, and namespace that would be deleted |
| `drain_node` | Exact pod list that would be evicted vs skipped (capped at 50) |
| `helm_uninstall` | Release name and namespace that would be removed |

This two-step pattern prevents accidental deletions when an AI assistant constructs a tool call from an ambiguous instruction.

---

## Available Tools

`podscape-mcp` exposes **37 tools** across four categories.

### Read-only tools (15)

These tools only read from the cluster and never modify state.

#### `list_resources`

List any Kubernetes resource type. Supports all built-in types and any CRD by plural name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource` | string | yes | Resource type: `pods`, `deployments`, `services`, `nodes`, `configmaps`, `secrets`, custom CRD plural names (e.g. `virtualservices`, `ingressroutes`), etc. |
| `namespace` | string | no | Namespace filter; omit for all namespaces |
| `label_selector` | string | no | Label selector, e.g. `app=nginx` or `env=prod,tier=frontend` |
| `field_selector` | string | no | Field selector, e.g. `status.phase=Running` or `spec.nodeName=node-1` |
| `limit` | number | no | Max results to return (default 100; set to 0 for unlimited) |

#### `get_resource`

Get a single Kubernetes resource by name. Supports built-in types and CRDs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource` | string | yes | Resource type |
| `name` | string | yes | Resource name |
| `namespace` | string | no | Namespace; omit for cluster-scoped resources |

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
| `init_container` | boolean | no | When true, fetches logs from init containers instead of main containers |

#### `list_events`

List Kubernetes events sorted by most recent first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | no | Namespace filter; omit for all namespaces |
| `type` | string | no | `Warning` or `Normal`; omit for all types |
| `object_name` | string | no | Filter events for a specific object name |
| `limit` | number | no | Max events to return (default 100) |

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

#### `helm_history`

List all revisions of a Helm release.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |

Returns an array of revisions, each with `revision`, `status`, `chart`, `appVersion`, `updated`, and `description`.

#### `security_scan`

Run a security posture scan on all pods in a namespace. Checks for:

- Missing `SecurityContext`
- Privileged containers
- Containers running as root (container-level and pod-level)
- Missing resource limits
- Host network / PID / IPC namespace usage
- `allowPrivilegeEscalation` not explicitly set to `false`
- `readOnlyRootFilesystem` not set to `true`
- Dangerous capabilities present: `NET_ADMIN`, `SYS_ADMIN`, `SYS_PTRACE`, `ALL`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | yes | Namespace to scan |

Each finding includes: `pod`, `container`, `issue`, and `severity` (`WARN`, `HIGH`, or `CRITICAL`).

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

### Diagnostic tools (5)

These tools bundle multiple API calls into a single response to reduce round-trips during common diagnostic workflows.

#### `pod_summary`

Get a combined view of a pod's status, container states, recent events, and last N log lines — everything needed to diagnose a failing pod in one call. Init container logs are fetched concurrently alongside main container logs and included in `container_logs` under `init:<name>` keys.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pod` | string | yes | Pod name |
| `namespace` | string | yes | Namespace |
| `tail` | number | no | Log lines per container (default 50) |
| `previous` | boolean | no | Fetch logs from the previously terminated container instance |

Returns: `phase`, `conditions`, `containers` (state/reason/message per container), `events`, and `container_logs` (map of container name → log output; init containers keyed as `init:<name>`).

#### `cluster_health`

Get a one-call cluster health overview: node ready/total counts, pod counts by phase (Running, Pending, Failed, etc.), and Warning events from the last hour.

No parameters required.

Warning events are capped at 50 entries; a `warning_events_truncated: true` field is added when the cap is reached.

#### `list_failing_pods`

List all pods that are not in `Running` or `Succeeded` state, plus any `Running` pods with containers in a `Waiting` or not-ready state. Includes phase, reason, and per-container failure details.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | no | Namespace filter; omit for all namespaces |

#### `get_resource_events`

Get Kubernetes events for a specific named resource — equivalent to the Events section of `kubectl describe`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | Resource kind, e.g. `Pod`, `Deployment`, `Node`, `Service` |
| `name` | string | yes | Resource name |
| `namespace` | string | no | Namespace; omit for cluster-scoped resources |

#### `describe_resource`

Get a resource and its events in one call — equivalent to `kubectl describe` without the table formatting. Avoids requiring two separate tool calls when diagnosing a resource.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource` | string | yes | Resource type (plural), e.g. `pods`, `deployments`, `services` |
| `name` | string | yes | Resource name |
| `namespace` | string | no | Namespace; omit for cluster-scoped resources |

Returns: `{ "resource": { ... }, "events": [ ... ] }`

---

### Mutating tools (11)

These tools modify cluster state. Destructive tools require `confirm=true` — see [Safety gates](#safety-gates).

#### `scale_resource`

Scale a deployment or statefulset to a desired replica count.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | `deployment` or `statefulset` |
| `name` | string | yes | Resource name |
| `namespace` | string | yes | Namespace |
| `replicas` | number | yes | Desired replica count (must be >= 0) |

#### `delete_resource`

Delete a Kubernetes resource. **Requires `confirm=true` to execute** — call without it first to see a preview.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | yes | Resource kind, e.g. `pod`, `deployment`, `service` |
| `name` | string | yes | Resource name |
| `namespace` | string | yes | Namespace |
| `confirm` | boolean | no | Must be `true` to delete. Omit or set `false` to preview what will be deleted. |

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

#### `cordon_node`

Cordon or uncordon a node to prevent or allow new pod scheduling.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Node name |
| `unschedulable` | boolean | yes | `true` = cordon (prevent new pods), `false` = uncordon |

#### `drain_node`

Evict all pods from a node to prepare it for maintenance. **Requires `confirm=true` to execute** — call without it first to see which pods would be evicted.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Node name |
| `force` | boolean | no | Delete pods not managed by a controller (default `false`) |
| `ignore_daemonsets` | boolean | no | Skip DaemonSet-managed pods (default `true`) |
| `delete_emptydir_data` | boolean | no | Allow eviction of pods with emptyDir volumes (default `false`) |
| `confirm` | boolean | no | Must be `true` to drain. Omit or set `false` to preview which pods would be evicted. |

Preview response (without `confirm=true`):
```json
{
  "node": "node-1",
  "would_evict": 12,
  "would_skip": 4,
  "pods_to_evict": ["production/api-pod-abc", "production/worker-pod-xyz"],
  "message": "Set confirm=true to drain node node-1 (will evict 12 pods, skip 4)."
}
```

The `pods_to_evict` list is capped at 50 entries; a `"truncated": true` field is added when there are more.

#### `trigger_cronjob`

Manually trigger a CronJob by creating a Job from its template — equivalent to `kubectl create job --from=cronjob/<name>`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | CronJob name |
| `namespace` | string | yes | Namespace |

Returns the name of the created Job.

#### `exec_command`

Execute a one-shot command inside a running pod container and return combined stdout + stderr. Suitable for non-interactive commands (`ls`, `env`, `cat /path`, `ps aux`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pod` | string | yes | Pod name |
| `namespace` | string | yes | Namespace |
| `container` | string | no | Container name (defaults to first container) |
| `command` | array | yes | Command and arguments, e.g. `["ls", "-la", "/tmp"]` |

Non-zero container exit codes are returned as part of the result text (not as a tool error), so the AI can see the output even when the command fails.

#### `switch_context`

Switch the active Kubernetes context for all subsequent tool calls. All tools called after a successful `switch_context` will operate against the new cluster.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `context` | string | yes | Kubernetes context name (must exist in kubeconfig) |

Returns `"Switched to context <name>"` on success. Returns an error if the context is not found in the kubeconfig — the active context is not changed on error.

#### `helm_rollback`

Roll back a Helm release to a previous revision.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |
| `revision` | number | no | Target revision; omit or set to `0` for the previous revision |

---

### Helm lifecycle tools (6)

#### `helm_upgrade`

Upgrade an existing Helm release, or install it if not present (`--install`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |
| `chart` | string | yes | Chart reference: local path, `repo/chart`, or OCI reference |
| `values` | string | no | Optional YAML string of values to merge over chart defaults |

Returns: `{ "release": "...", "status": "deployed", "revision": 3 }`

#### `helm_uninstall`

Uninstall a Helm release and remove all associated Kubernetes resources. **Requires `confirm=true` to execute** — call without it first to see a preview.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |
| `confirm` | boolean | no | Must be `true` to uninstall. Omit or set `false` to preview what will be removed. |

#### `helm_history`

List all revisions of a Helm release (same as `helm history`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `release` | string | yes | Release name |
| `namespace` | string | yes | Namespace |

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

### Drain a node for maintenance

Ask your AI assistant:

> "I need to take node-3 offline for maintenance. Drain it."

The assistant will:
1. Call `drain_node` with `name=node-3` (no `confirm`) — receives the pod preview
2. Present the preview to you for confirmation
3. Call `drain_node` again with `confirm=true` to execute

---

### Debug a failing init container

Ask your AI assistant:

> "The api-server pod keeps getting stuck in Init state. What's happening?"

The assistant will likely call:
1. `describe_resource` with `resource=pods, name=api-server` — gets the pod spec and events in one call
2. `get_pod_logs` with `init_container=true` to see what the init container printed before failing

---

### Switch clusters mid-session

Ask your AI assistant:

> "Switch to the staging cluster and check if the same issue exists there."

The assistant calls:
1. `list_contexts` to see available contexts
2. `switch_context` with the staging context name
3. Any subsequent tool calls now operate against staging

---

### Roll back a broken Helm release

Ask your AI assistant:

> "The last deploy of the checkout-service Helm release broke something. Roll it back to the previous revision."

The assistant will likely call:
1. `helm_status` with `release=checkout-service` to confirm the current state
2. `helm_history` to see available revisions
3. `helm_rollback` with `release=checkout-service` and `revision=0`
4. `helm_status` again to confirm the rollback succeeded

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

### Tools operate on the wrong cluster after a context switch

Use the `switch_context` tool to change the active context mid-session — the server will reinitialise its client against the new cluster immediately. Alternatively, restart the MCP client session after running `kubectl config use-context` in your terminal.
