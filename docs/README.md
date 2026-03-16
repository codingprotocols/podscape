# Podscape Documentation

Welcome to the Podscape documentation. This folder contains detailed technical guides and architectural overviews for the project.

## 📖 Contents

- [**Architecture Overview**](architecture.md): Deep dive into the three-process model and Go sidecar integration.
- [**Security Hub**](security.md): Details on the dynamic scanning (Trivy) and static audit (Kubesec) implementations.
- [**Development Guide**](development.md): How to set up, build, and distribute the application.
- [**API Reference (Sidecar)**](api.md): Overview of the HTTP endpoints provided by the Go sidecar.

---

## ⚡ Quick Start

To get the project running in development mode:

1. Build the Go sidecar:
   ```bash
   cd go-core && go build ./cmd/podscape-core/
   ```
2. Start the Electron app:
   ```bash
   npm install
   npm run dev
   ```
