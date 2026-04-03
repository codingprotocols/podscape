GO_CORE     := go-core/podscape-core
GO_MCP      := go-core/podscape-mcp
GO_LDFLAGS  := -ldflags="-s -w"

.PHONY: dev build test go go-mcp go-test clean build-mac build-win build-linux

## Start the app in dev mode (builds Go sidecar first if missing)
dev: $(GO_CORE)
	npm run dev

## Full production build (Go + Electron)
build: go
	electron-vite build

## Build the Go sidecar
go:
	cd go-core && go build $(GO_LDFLAGS) -o podscape-core ./cmd/podscape-core/

## Build the MCP server
go-mcp:
	cd go-core && go build $(GO_LDFLAGS) -o podscape-mcp ./cmd/podscape-mcp/

## Run Go tests
go-test:
	cd go-core && go test ./...

## Run JS/TS tests
test:
	npm run test

## Run all tests
test-all: go-test test

## macOS distribution build (delegates to npm to preserve notarization afterSign hook)
build-mac:
	npm run build:mac

## Windows distribution build
build-win:
	npm run build:win

## Linux distribution build
build-linux:
	npm run build:linux

## Remove build artifacts
clean:
	rm -f go-core/podscape-core go-core/podscape-mcp
	rm -rf out dist

# Build the sidecar only when it doesn't exist
$(GO_CORE):
	$(MAKE) go
