// Package main provides the Podscape MCP server — a Model Context Protocol
// server that exposes Kubernetes cluster operations as tools for AI assistants.
package main

import (
	"fmt"
	"os"
	"sync"

	"github.com/mark3labs/mcp-go/server"
	"github.com/podscape/go-core/internal/client"
	"github.com/spf13/cobra"
)

// Version is set at build time via -ldflags.
var Version = "dev"

var kubeconfig string

// bundle holds the active Kubernetes client bundle.
// All handlers acquire bundleMu.RLock() before reading bundle.
// switch_context acquires bundleMu.Lock() to swap bundle atomically.
var (
	bundle   *client.ClientBundle
	bundleMu sync.RWMutex
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "podscape-mcp",
		Short: "Podscape MCP Server — Kubernetes tools for AI assistants",
		Long: `Podscape MCP Server exposes Kubernetes cluster operations as MCP tools,
enabling AI assistants like Claude and Cursor to interact with your K8s clusters.

Configure in your MCP client:
  {
    "mcpServers": {
      "podscape": {
        "command": "podscape-mcp",
        "args": ["--kubeconfig", "/path/to/kubeconfig"]
      }
    }
  }`,
		RunE: runServer,
	}

	rootCmd.Flags().StringVar(&kubeconfig, "kubeconfig", "", "path to kubeconfig file")

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runServer(cmd *cobra.Command, args []string) error {
	var err error
	bundle, err = client.Init(kubeconfig)
	if err != nil {
		return err
	}

	s := server.NewMCPServer(
		"podscape",
		Version,
		server.WithToolCapabilities(true),
	)

	registerTools(s)

	return server.ServeStdio(s)
}
