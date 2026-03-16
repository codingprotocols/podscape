# 🛠️ Development Guide

This guide covers everything you need to know to set up a development environment, build the project, and package it for distribution.

## 1. Prerequisites
- **Node.js**: v20+ (v22 recommended)
- **Go**: v1.23+
- **Electron-Vite**: (installed via npm)
- **Trivy CLI**: (Optional, for security scanning) `brew install trivy`

## 2. Setting Up the Project

Clone the repository and install dependencies:
```bash
npm install
```

## 3. Building the Go Sidecar
The application requires the Go sidecar binary to be present in the `go-core` directory during development.

```bash
cd go-core
go build -o podscape-core ./cmd/podscape-core/
```

## 4. Running in Development
Start the application with hot-reload enabled:
```bash
npm run dev
```

## 5. Running Tests
### Frontend (Vitest)
```bash
npm run test
```
### Backend (Go)
```bash
cd go-core
go test ./...
```

## 6. Building for Production

To package the application for your current platform:

### macOS
```bash
npm run build:mac
```

### Windows
```bash
npm run build:win
```

### Linux
```bash
npm run build:linux
```

The resulting installers will be in the `out/` directory.
