# Contributing to Podscape

Thank you for your interest in contributing. This document covers how to get set up, what to work on, and how to submit changes.

---

## Getting started

**Prerequisites:** Node.js 20+, Go 1.22+

```bash
git clone https://github.com/codingprotocols/podscape.git
cd podscape-electron
npm install

# Build the Go sidecar before first run
cd go-core && go build ./cmd/podscape-core/ && cd ..

npm run dev
```

---

## Project structure

The app has three processes that communicate over HTTP and Electron IPC:

- `src/main/` — Electron main process (Node.js): IPC handlers, terminal, sidecar lifecycle
- `src/preload/` — context bridge that exposes APIs to the renderer
- `src/renderer/` — React UI (components, Zustand store)
- `go-core/` — Go sidecar (`podscape-core`) and MCP server (`podscape-mcp`)

See [README.md](README.md) for the full architecture overview.

---

## Running tests

```bash
# Frontend
npm run test

# Go
cd go-core && go test ./...
```

Please make sure both pass before submitting a pull request. New features should include tests.

---

## Making changes

1. Fork the repository and create a branch from `main`
2. Make your changes
3. Ensure `npm run build` completes without errors
4. Ensure all tests pass
5. Open a pull request with a clear description of what changed and why

---

## What to work on

Check the [Issues](https://github.com/codingprotocols/podscape/issues) tab for open bugs and feature requests. Issues labelled `good first issue` are a good starting point.

If you want to work on something not listed, open an issue first to discuss it before investing time in a large change.

---

## Adding a kubectl plugin

Podscape has a built-in plugin panel (powered by [Krew](https://krew.sigs.k8s.io/)) that surfaces a curated set of kubectl plugins with rich UIs. To add a new plugin:

1. **Register it** in `src/renderer/config/krewPlugins.json` — add a JSON entry with `name`, `short`, `description`, `category`, `homepage`, `docs`, and `tags`.
2. **Create a module** at `src/renderer/components/plugins/<name>/` with two files:
   - `InfoPanel.tsx` — rendered on the Info tab; use `PluginInfoLayout` as the wrapper.
   - `RunPanel.tsx` — rendered on the Run tab; use `usePluginRun` to invoke the plugin and stream output.
3. **Register the loader** in `src/renderer/components/plugins/pluginRegistry.ts`.

See existing plugins (`stern`, `neat`, `tree`, etc.) for reference implementations.

---

## Code style

- TypeScript: follow existing patterns; no `any` unless unavoidable
- Go: run `gofmt` and `go vet` before committing
- Keep components focused — one responsibility per file

---

## Reporting bugs

Open an issue at [podscape/issues](https://github.com/codingprotocols/podscape/issues) with:
- What you did
- What you expected
- What actually happened
- Your OS, app version, and Kubernetes version

---

## Acknowledgements

Podscape's plugin panel integrates the following open-source kubectl plugins. We are grateful to their authors and maintainers for building and sharing these tools with the community.

| Plugin | Description | Author / Repo |
|--------|-------------|---------------|
| [kubectl-neat](https://github.com/itaysk/kubectl-neat) | Remove clutter from Kubernetes manifests | [@itaysk](https://github.com/itaysk) |
| [stern](https://github.com/stern/stern) | Multi-pod and container log tailing | [stern/stern](https://github.com/stern/stern) |
| [kubectl-tree](https://github.com/ahmetb/kubectl-tree) | Show object hierarchies via ownerReferences | [@ahmetb](https://github.com/ahmetb) |
| [kubectl-images](https://github.com/chenjiandongx/kubectl-images) | Show container images used in the cluster | [@chenjiandongx](https://github.com/chenjiandongx) |
| [kubectl-whoami](https://github.com/rajatjindal/kubectl-whoami) | Show the currently authenticated subject | [@rajatjindal](https://github.com/rajatjindal) |
| [kubectl-df-pv](https://github.com/yashbhutwala/kubectl-df-pv) | Show disk usage of PersistentVolumes | [@yashbhutwala](https://github.com/yashbhutwala) |
| [outdated](https://github.com/replicatedhq/outdated) | Find outdated container images in a cluster | [replicatedhq](https://github.com/replicatedhq) |

These plugins are installed and managed via [Krew](https://krew.sigs.k8s.io/) — the kubectl plugin manager. Podscape does not bundle or redistribute them; they are installed locally on the user's machine.

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
