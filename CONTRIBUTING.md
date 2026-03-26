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

Check the [Issues](https://github.com/codingprotocols/podscape-community/issues) tab for open bugs and feature requests. Issues labelled `good first issue` are a good starting point.

If you want to work on something not listed, open an issue first to discuss it before investing time in a large change.

---

## Code style

- TypeScript: follow existing patterns; no `any` unless unavoidable
- Go: run `gofmt` and `go vet` before committing
- Keep components focused — one responsibility per file

---

## Reporting bugs

Open an issue at [podscape-community/issues](https://github.com/codingprotocols/podscape-community/issues) with:
- What you did
- What you expected
- What actually happened
- Your OS, app version, and Kubernetes version

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
