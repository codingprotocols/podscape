package main

import (
	"context"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/podscape/go-core/internal/helm"
)

func registerHelmTools(s *server.MCPServer) {
	s.AddTool(mcp.NewTool("helm_list",
		mcp.WithDescription("List Helm releases"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("namespace", mcp.Description("Namespace filter")),
	), handleHelmList)

	s.AddTool(mcp.NewTool("helm_status",
		mcp.WithDescription("Get status of a Helm release"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("release", mcp.Required(), mcp.Description("Release name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
	), handleHelmStatus)

	s.AddTool(mcp.NewTool("helm_values",
		mcp.WithDescription("Get values of a Helm release"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("release", mcp.Required(), mcp.Description("Release name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithBoolean("all", mcp.Description("Include computed values")),
	), handleHelmValues)

	s.AddTool(mcp.NewTool("helm_rollback",
		mcp.WithDescription("Roll back a Helm release to a previous revision"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("release", mcp.Required(), mcp.Description("Release name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithNumber("revision", mcp.Description("Target revision (0 = previous)")),
	), handleHelmRollback)

	s.AddTool(mcp.NewTool("helm_history",
		mcp.WithDescription("List all revisions of a Helm release"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("release", mcp.Required(), mcp.Description("Release name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
	), handleHelmHistory)

	s.AddTool(mcp.NewTool("helm_upgrade",
		mcp.WithDescription("Upgrade an existing Helm release, or install it if not present (--install)"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("release", mcp.Required(), mcp.Description("Release name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithString("chart", mcp.Required(), mcp.Description("Chart reference (local path, repo/chart, or OCI reference)")),
		mcp.WithString("values", mcp.Description("Optional YAML string of values to merge over chart defaults")),
	), handleHelmUpgrade)

	s.AddTool(mcp.NewTool("helm_uninstall",
		mcp.WithDescription("Uninstall a Helm release. Call without confirm=true first to see what will be removed, then call again with confirm=true to proceed."),
		mcp.WithDestructiveHintAnnotation(true),
		mcp.WithString("release", mcp.Required(), mcp.Description("Release name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithBoolean("confirm", mcp.Description("Must be true to actually uninstall. Omit or set false to preview what will be removed.")),
	), handleHelmUninstall)
}

func handleHelmList(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	ns := argStr(req, "namespace")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	releases, err := helm.ListReleases(b.Kubeconfig, b.ContextName, ns)
	if err != nil {
		return errResult(err), nil
	}
	return jsonResult(releases)
}

func handleHelmStatus(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	releaseName := argStr(req, "release")
	ns := argStr(req, "namespace")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	status, err := helm.GetReleaseStatus(b.Kubeconfig, b.ContextName, ns, releaseName)
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(status), nil
}

func handleHelmValues(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	releaseName := argStr(req, "release")
	ns := argStr(req, "namespace")
	all := argBool(req, "all")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	values, err := helm.GetReleaseValues(b.Kubeconfig, b.ContextName, ns, releaseName, all)
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(values), nil
}

func handleHelmRollback(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	releaseName := argStr(req, "release")
	ns := argStr(req, "namespace")
	revision := 0
	if r, ok := argFloat(req, "revision"); ok {
		revision = int(r)
	}

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	if err := helm.RollbackRelease(b.Kubeconfig, b.ContextName, ns, releaseName, revision); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Rolled back Helm release %s in namespace %s", releaseName, ns)), nil
}

func handleHelmHistory(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	releaseName := argStr(req, "release")
	ns := argStr(req, "namespace")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	releases, err := helm.GetReleaseHistory(b.Kubeconfig, b.ContextName, ns, releaseName)
	if err != nil {
		return errResult(err), nil
	}

	type revisionSummary struct {
		Revision    int    `json:"revision"`
		Status      string `json:"status"`
		Chart       string `json:"chart"`
		AppVersion  string `json:"appVersion"`
		Updated     string `json:"updated"`
		Description string `json:"description"`
	}
	history := make([]revisionSummary, 0, len(releases))
	for _, r := range releases {
		rs := revisionSummary{
			Revision:    r.Version,
			Status:      string(r.Info.Status),
			Description: r.Info.Description,
			Updated:     r.Info.LastDeployed.Format("2006-01-02T15:04:05Z"),
		}
		if r.Chart != nil && r.Chart.Metadata != nil {
			rs.Chart = r.Chart.Metadata.Name + "-" + r.Chart.Metadata.Version
			rs.AppVersion = r.Chart.Metadata.AppVersion
		}
		history = append(history, rs)
	}
	return jsonResult(history)
}

func handleHelmUpgrade(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	releaseName := argStr(req, "release")
	ns := argStr(req, "namespace")
	chart := argStr(req, "chart")
	values := argStr(req, "values")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	rel, err := helm.UpgradeRelease(b.Kubeconfig, b.ContextName, ns, releaseName, chart, values)
	if err != nil {
		return errResult(err), nil
	}

	type upgradeSummary struct {
		Release  string `json:"release"`
		Status   string `json:"status"`
		Revision int    `json:"revision"`
	}
	summary := upgradeSummary{
		Release:  rel.Name,
		Status:   string(rel.Info.Status),
		Revision: rel.Version,
	}
	return jsonResult(summary)
}

func handleHelmUninstall(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	releaseName := argStr(req, "release")
	ns := argStr(req, "namespace")
	confirm := argBool(req, "confirm")

	if !confirm {
		return mcp.NewToolResultText(fmt.Sprintf(
			"This will permanently uninstall Helm release %s from namespace %s, removing all associated Kubernetes resources. Set confirm=true to proceed.",
			releaseName, ns,
		)), nil
	}

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	_, err := helm.UninstallRelease(b.Kubeconfig, b.ContextName, ns, releaseName)
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Uninstalled Helm release %s from namespace %s", releaseName, ns)), nil
}
