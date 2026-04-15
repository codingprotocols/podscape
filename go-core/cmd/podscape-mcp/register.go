package main

import "github.com/mark3labs/mcp-go/server"

// registerTools registers all MCP tool categories with the server.
func registerTools(s *server.MCPServer) {
	registerReadTools(s)
	registerDiagTools(s)
	registerMutateTools(s)
	registerHelmTools(s)
}
