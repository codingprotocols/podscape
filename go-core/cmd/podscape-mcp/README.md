# podscape-mcp

A standalone MCP (Model Context Protocol) server that exposes your Kubernetes cluster as tools for AI assistants — Claude, Cursor, and any other MCP-compatible client.

Ask questions and make changes in plain language. No `kubectl` required.

---

## Build

```bash
cd go-core
go build ./cmd/podscape-mcp/
```

The binary is produced at `go-core/podscape-mcp`. Pre-built binaries for all platforms are available on every [GitHub Release](https://github.com/codingprotocols/podscape-community/releases/latest).

---

## Usage

```
podscape-mcp [--kubeconfig <path>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--kubeconfig` | `~/.kube/config` | Path to kubeconfig file |

Kubeconfig resolution order: `--kubeconfig` flag → `$KUBECONFIG` → `~/.kube/config`.

The server communicates over `stdio` and is started automatically by your MCP client — you don't run it manually.

---

## Configuring your AI assistant

### Claude Code (CLI)

```bash
claude mcp add --transport stdio podscape -- /path/to/podscape-mcp
```

During development, point directly at the built binary:
```bash
claude mcp add --transport stdio podscape -- $(pwd)/go-core/podscape-mcp
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:
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

### Cursor

`.cursor/mcp.json`:
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

---

## Tools

### Read-only (13)

| Tool | Description |
|------|-------------|
| `list_resources` | List any resource type with optional namespace + label selector |
| `get_resource` | Get a single resource by name |
| `get_resource_yaml` | Get the full YAML manifest |
| `get_pod_logs` | Fetch container logs (`tail`, `previous`) |
| `list_events` | List events with optional namespace filter |
| `get_resource_events` | Events for a specific resource (like `kubectl describe`) |
| `list_namespaces` | List all namespaces |
| `list_contexts` | List kubeconfig contexts |
| `get_current_context` | Active context name |
| `helm_list` | List Helm releases |
| `helm_status` | Status of a Helm release |
| `helm_values` | Values of a Helm release |
| `security_scan` | Pod security posture scan for a namespace |
| `detect_providers` | Detect Istio, Traefik, Nginx |

### Mutating (6)

| Tool | Description |
|------|-------------|
| `scale_resource` | Scale a deployment or statefulset |
| `delete_resource` | Delete a resource |
| `rollout_restart` | Rolling restart of a deployment, daemonset, or statefulset |
| `rollout_undo` | Roll back a deployment to a previous revision |
| `apply_yaml` | Apply a YAML manifest (server-side apply) |
| `helm_rollback` | Roll back a Helm release |

### Diagnostic aggregation (4)

| Tool | Description |
|------|-------------|
| `pod_summary` | Status + container states + events + logs in one call |
| `cluster_health` | Node/pod counts + last hour's Warning events |
| `list_failing_pods` | All non-Running/Succeeded pods with failure details |
| `get_resource_events` | Events scoped to a specific named resource |

---

## Tests

```bash
cd go-core
go test ./cmd/podscape-mcp/
```

Tests cover argument extraction helpers and the `scanPods` security scanner without a live cluster.
