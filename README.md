# Podscape

A desktop Kubernetes management app built on Electron + React + TypeScript.
Manage clusters, stream logs, exec into containers, inspect RBAC, visualise network topology, and more — all from a single native app.

**[Download](https://github.com/codingprotocols/podscape-community/releases/latest)** · **[Docs](https://github.com/codingprotocols/podscape-community/tree/main/docs)** · **[Issues](https://github.com/codingprotocols/podscape-community/issues)**

---

## Architecture

Podscape is a three-process Electron app with a Go sidecar:

```
Renderer (React/TS)
  ├─ HTTP → Go Sidecar (127.0.0.1:5050)   — all k8s + Helm operations
  └─ IPC  → Main Process (Node.js)         — terminal, file dialogs, port-forward, log streaming
```

| Layer | Stack |
|-------|-------|
| Renderer | React 18, TypeScript, Tailwind CSS, Zustand, xterm.js, Monaco Editor, Recharts |
| Main process | Electron, node-pty |
| Go sidecar | `podscape-core` — HTTP server, shared informer cache, RBAC probe |
| MCP server | `podscape-mcp` — standalone MCP server for AI assistant integration |

---

## Development

**Prerequisites:** Node.js 20+, Go 1.22+

```bash
# Install dependencies
npm install

# Build the Go sidecar (required before first run)
cd go-core && go build ./cmd/podscape-core/ && cd ..

# Start in dev mode (hot reload)
npm run dev
```

### Other commands

```bash
npm run build          # Build all processes + Go sidecar
npm run test           # Run frontend tests (vitest)
npm run test:watch     # Watch mode

cd go-core
go test ./...          # Run Go tests
go build ./cmd/podscape-mcp/   # Build the MCP server binary
```

---

## MCP Server

`podscape-mcp` is a standalone binary that exposes your Kubernetes cluster as tools for AI assistants (Claude, Cursor, etc.).

```bash
# Build
cd go-core && go build ./cmd/podscape-mcp/

# Add to Claude Code
claude mcp add --transport stdio podscape -- ./go-core/podscape-mcp
```

See [go-core/cmd/podscape-mcp/README.md](go-core/cmd/podscape-mcp/README.md) for full setup instructions.

---

## Distribution

Releases are triggered by pushing a `v*` tag. GitHub Actions builds for macOS (arm64 + x64), Windows, and Linux in parallel and publishes to GitHub Releases.

```bash
git tag v2.2.0 && git push origin v2.2.0
```

### macOS signing + notarization

Set these repository secrets before releasing:

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded `.p12` Developer ID certificate |
| `CSC_KEY_PASSWORD` | `.p12` password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Apple Team ID |
| `GH_TOKEN` | GitHub PAT with `repo` scope |

---

## Project structure

```
podscape-electron/
├── src/
│   ├── main/          # Electron main process (sidecar, IPC handlers, terminal)
│   ├── preload/       # Context bridge — exposes window.kubectl, window.helm, etc.
│   └── renderer/      # React app (components, store, routing)
├── go-core/
│   ├── cmd/
│   │   ├── podscape-core/   # HTTP sidecar binary
│   │   └── podscape-mcp/    # MCP server binary
│   └── internal/
│       ├── client/          # Shared k8s client initialisation
│       ├── handlers/        # HTTP route handlers
│       ├── informers/       # Shared informer cache
│       ├── ops/             # Write operations (scale, delete, apply, rollout)
│       ├── logs/            # Log streaming
│       ├── helm/            # Helm SDK wrapper
│       ├── rbac/            # RBAC probe
│       ├── store/           # Global sidecar state
│       └── portforward/     # Port-forward manager
├── resources/         # Icons, splash screen
├── scripts/           # Build helpers (notarize, icon generation)
└── CHANGELOG.md
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
