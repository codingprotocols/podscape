# Development Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | v20+ (v22 recommended) | |
| Go | v1.22+ | CGO must be enabled |
| C compiler | any | Required by CGO — `gcc` on Linux, Xcode CLT on macOS, MinGW on Windows |
| Trivy CLI | optional | For image vulnerability scanning in Security Hub |

Install Trivy (macOS):
```bash
brew install trivy
```

---

## Setup

```bash
# Install Node dependencies (also runs postinstall which rebuilds node-pty)
npm install

# Build the Go sidecar — required before first dev run
cd go-core && go build ./cmd/podscape-core/ && cd ..
```

---

## Development

```bash
npm run dev          # Start Electron + Vite dev server with hot reload
```

> **Note:** If `window.kubectl.*` methods appear as `undefined` at runtime, the preload build is stale. Restart `npm run dev`.

---

## Running Tests

```bash
# Frontend (Vitest)
npm run test
npm run test:watch   # watch mode

# Go sidecar (handlers, rbac, helm, portforward, prometheus, ownerchain)
cd go-core && go test ./...
```

---

## Building

The full build compiles the Go sidecar first, then runs electron-vite:

```bash
npm run build        # Go sidecar + renderer + main + preload
```

Individual steps:
```bash
cd go-core && go build ./cmd/podscape-core/   # sidecar binary only
cd go-core && go build ./cmd/podscape-mcp/    # MCP server binary only
npx electron-vite build                        # Electron assets only
```

---

## Distribution

Packages are produced by `electron-builder`. Artifacts land in `dist/`.

```bash
npm run build:mac    # macOS — .dmg + .zip (arm64 and x64 separately)
npm run build:win    # Windows — NSIS installer (.exe)
npm run build:linux  # Linux — AppImage + .deb
```

### Icon generation

Icons must be generated before packaging if they don't already exist:

```bash
npm run icon:icns    # macOS .icns from resources/icon.png
npm run icon:ico     # Windows .ico from resources/icon.png
```

Requirements: `imagemagick` (Linux/macOS) or the scripts handle it via `sips` on macOS.

---

## CI / Release

Releases are triggered by pushing a `v*` git tag. The workflow (`.github/workflows/release.yml`) runs three parallel jobs:

| Job | Runner | Output |
|---|---|---|
| `release-mac` (arm64) | `macos-latest` | `.dmg` + `.zip` for Apple Silicon |
| `release-mac` (x64) | `macos-13` | `.dmg` + `.zip` for Intel |
| `release-win` | `windows-latest` | `.exe` NSIS installer |
| `release-linux` | `ubuntu-latest` | `.AppImage` + `.deb` |

Each job also uploads a `checksums-<platform>.txt` file to the GitHub release so users can verify downloads with SHA256.

```bash
# Create and push a release tag
git tag v2.3.0
git push origin v2.3.0
```

Required GitHub secret: `GH_TOKEN` with `contents: write` permission on the repository.

---

## Known Build Notes

- **`node-pty` native rebuild**: `npm install` runs `electron-builder install-app-deps` via `postinstall`, which rebuilds `node-pty` for the target Electron version. On macOS the prebuilt `spawn-helper` binaries may lack execute permission — the `postinstall` script applies `chmod +x` automatically.
- **CGO on Windows**: MinGW must be on `PATH` before building the Go sidecar. The CI workflow adds it via `$env:PATH`.
- **Sidecar location**: In dev, the binary is expected at `go-core/podscape-core`. In production, electron-builder copies it to `resources/bin/podscape-core` via `extraResources`.
