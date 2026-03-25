package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/podscape/go-core/internal/helm"
	"github.com/podscape/go-core/internal/logs"
	"github.com/podscape/go-core/internal/ops"
	"github.com/podscape/go-core/internal/providers"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"sigs.k8s.io/yaml"
)

// args extracts the Arguments map from the request.
func args(req mcp.CallToolRequest) map[string]interface{} {
	if m, ok := req.Params.Arguments.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func argStr(req mcp.CallToolRequest, key string) string {
	v, _ := args(req)[key].(string)
	return v
}

func argFloat(req mcp.CallToolRequest, key string) (float64, bool) {
	v, ok := args(req)[key].(float64)
	return v, ok
}

func argBool(req mcp.CallToolRequest, key string) bool {
	v, _ := args(req)[key].(bool)
	return v
}

const (
	// apiTimeout is the standard timeout applied to every Kubernetes API call.
	apiTimeout = 30 * time.Second
	// maxLogBytes caps the total log output returned by get_pod_logs to prevent OOM.
	maxLogBytes = 512 * 1024 // 512 KB
	// maxLogBytesPerContainer caps per-container log output inside pod_summary.
	maxLogBytesPerContainer = 32 * 1024 // 32 KB
)

// crdSummary is a trimmed projection of an apiextensions CRD, used by list_crds.
type crdSummary struct {
	Name    string `json:"name"`
	Group   string `json:"group"`
	Kind    string `json:"kind"`
	Plural  string `json:"plural"`
	Scope   string `json:"scope"`
	Version string `json:"version"`
}

// eventSummary is a JSON-friendly projection of corev1.Event, shared across
// list_events, get_resource_events, pod_summary, and cluster_health.
// Fields are omitempty so each call site only emits fields relevant to its context.
type eventSummary struct {
	Namespace string `json:"namespace,omitempty"`
	Type      string `json:"type,omitempty"`
	Reason    string `json:"reason"`
	Object    string `json:"object,omitempty"`
	Message   string `json:"message"`
	Count     int32  `json:"count"`
	LastSeen  string `json:"lastSeen"`
	Source    string `json:"source,omitempty"`
}

func summarizeEvent(e corev1.Event) eventSummary {
	return eventSummary{
		Namespace: e.Namespace,
		Type:      e.Type,
		Reason:    e.Reason,
		Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
		Message:   e.Message,
		Count:     e.Count,
		LastSeen:  e.LastTimestamp.Format(time.RFC3339),
		Source:    e.Source.Component,
	}
}

// readLogStream drains r into a string, capping output at maxBytes.
// A truncation suffix is appended when the limit is reached. Scanner errors
// (e.g. lines exceeding the token buffer) are appended as error lines.
func readLogStream(r io.ReadCloser, maxBytes int) string {
	defer r.Close()
	var sb strings.Builder
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 256*1024), 256*1024) // raise token limit to 256 KB
	for scanner.Scan() {
		if sb.Len()+len(scanner.Bytes())+1 > maxBytes {
			sb.WriteString(fmt.Sprintf("\n[output truncated — %d bytes limit reached]", maxBytes))
			return sb.String()
		}
		sb.WriteString(scanner.Text())
		sb.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil {
		sb.WriteString(fmt.Sprintf("\n[error reading logs: %v]", err))
	}
	return sb.String()
}

func registerTools(s *server.MCPServer) {
	// --- Read-only tools ---

	s.AddTool(mcp.NewTool("list_resources",
		mcp.WithDescription("List Kubernetes resources by type — supports built-in types (pods, deployments, services, nodes, etc.) and any CRD by plural name (e.g. nodepools, nodeclaims, virtualservices, ingressroutes, kustomizations, applications, helmreleases, gitrepositories)"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("resource", mcp.Required(), mcp.Description("Resource type: pods, deployments, services, nodes, namespaces, configmaps, secrets, etc.")),
		mcp.WithString("namespace", mcp.Description("Namespace filter (omit for all namespaces)")),
		mcp.WithString("label_selector", mcp.Description("Label selector filter, e.g. app=nginx or env=prod,tier=frontend")),
		mcp.WithNumber("limit", mcp.Description("Maximum number of results to return (default 100, 0 = unlimited)")),
	), handleListResources)

	s.AddTool(mcp.NewTool("get_resource",
		mcp.WithDescription("Get a single Kubernetes resource by name — supports built-in types and any CRD by plural name"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("resource", mcp.Required(), mcp.Description("Resource type")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Description("Namespace (omit for cluster-scoped resources)")),
	), handleGetResource)

	s.AddTool(mcp.NewTool("get_resource_yaml",
		mcp.WithDescription("Get full YAML manifest of a Kubernetes resource — supports built-in types and any CRD by plural name"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("resource", mcp.Required(), mcp.Description("Resource type")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Description("Namespace (omit for cluster-scoped resources)")),
	), handleGetResourceYAML)

	s.AddTool(mcp.NewTool("get_pod_logs",
		mcp.WithDescription("Get logs from a pod container"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("pod", mcp.Required(), mcp.Description("Pod name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithString("container", mcp.Description("Container name")),
		mcp.WithNumber("tail", mcp.Description("Number of lines to return (default 100); ignored when since_minutes is set")),
		mcp.WithNumber("since_minutes", mcp.Description("Return logs from the last N minutes (overrides tail)")),
		mcp.WithBoolean("previous", mcp.Description("Return logs from the previously terminated container instance (useful for crash-looping containers)")),
	), handleGetPodLogs)

	s.AddTool(mcp.NewTool("list_events",
		mcp.WithDescription("List Kubernetes events, sorted by most recent first"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("namespace", mcp.Description("Namespace filter (omit for all namespaces)")),
		mcp.WithString("type", mcp.Description("Event type filter: Warning or Normal (omit for all)")),
		mcp.WithString("object_name", mcp.Description("Filter events for a specific object name")),
		mcp.WithNumber("limit", mcp.Description("Maximum number of events to return (default 100)")),
	), handleListEvents)

	s.AddTool(mcp.NewTool("list_contexts",
		mcp.WithDescription("List available Kubernetes contexts"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	), handleListContexts)

	s.AddTool(mcp.NewTool("get_current_context",
		mcp.WithDescription("Get the current Kubernetes context name"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	), handleGetCurrentContext)

	s.AddTool(mcp.NewTool("list_namespaces",
		mcp.WithDescription("List all namespaces in the cluster"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	), handleListNamespaces)

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

	s.AddTool(mcp.NewTool("security_scan",
		mcp.WithDescription("Run a security posture scan on pods in a namespace"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace to scan")),
	), handleSecurityScan)

	s.AddTool(mcp.NewTool("detect_providers",
		mcp.WithDescription("Detect installed ingress/mesh providers (Istio, Traefik, Nginx)"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	), handleDetectProviders)

	// --- Mutating tools ---

	s.AddTool(mcp.NewTool("scale_resource",
		mcp.WithDescription("Scale a deployment or statefulset replica count"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithIdempotentHintAnnotation(true),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind: deployment or statefulset")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithNumber("replicas", mcp.Required(), mcp.Description("Desired replica count (must be >= 0)")),
	), handleScaleResource)

	s.AddTool(mcp.NewTool("delete_resource",
		mcp.WithDescription("Delete a Kubernetes resource"),
		mcp.WithDestructiveHintAnnotation(true),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind (pod, deployment, service, etc.)")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
	), handleDeleteResource)

	s.AddTool(mcp.NewTool("rollout_restart",
		mcp.WithDescription("Trigger a rolling restart of a deployment, daemonset, or statefulset"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind: deployment, daemonset, or statefulset")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
	), handleRolloutRestart)

	s.AddTool(mcp.NewTool("rollout_undo",
		mcp.WithDescription("Undo a deployment rollout to a previous revision"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind (currently only deployment)")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithNumber("revision", mcp.Description("Target revision (0 = previous)")),
	), handleRolloutUndo)

	s.AddTool(mcp.NewTool("apply_yaml",
		mcp.WithDescription("Apply a Kubernetes YAML manifest using server-side apply"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithIdempotentHintAnnotation(true),
		mcp.WithString("yaml", mcp.Required(), mcp.Description("The YAML manifest content")),
	), handleApplyYAML)

	s.AddTool(mcp.NewTool("helm_rollback",
		mcp.WithDescription("Roll back a Helm release to a previous revision"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("release", mcp.Required(), mcp.Description("Release name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithNumber("revision", mcp.Description("Target revision (0 = previous)")),
	), handleHelmRollback)

	// --- Diagnostic aggregation tools ---

	s.AddTool(mcp.NewTool("pod_summary",
		mcp.WithDescription("Get a combined summary of a pod's status, container states, recent events, and last N log lines — everything needed to diagnose a failing pod in one call"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("pod", mcp.Required(), mcp.Description("Pod name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithNumber("tail", mcp.Description("Log lines per container (default 50)")),
		mcp.WithBoolean("previous", mcp.Description("Fetch logs from the previously terminated container instance (useful for crash-looping containers)")),
	), handlePodSummary)

	s.AddTool(mcp.NewTool("cluster_health",
		mcp.WithDescription("Get a one-call cluster health overview: node ready/total counts, pod counts by phase (Running/Pending/Failed), and Warning events from the last hour"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	), handleClusterHealth)

	s.AddTool(mcp.NewTool("list_failing_pods",
		mcp.WithDescription("List all pods not in Running or Succeeded state, with their phase, reason, and container-level failure details — the fastest way to see what's broken in a cluster"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("namespace", mcp.Description("Namespace filter (omit for all namespaces)")),
	), handleListFailingPods)

	s.AddTool(mcp.NewTool("get_resource_events",
		mcp.WithDescription("Get Kubernetes events for a specific named resource (pod, deployment, node, service, etc.) — equivalent to 'kubectl describe' events section"),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind, e.g. Pod, Deployment, Node, Service")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Description("Namespace (omit for cluster-scoped resources)")),
	), handleGetResourceEvents)

	// --- Extended tools ---

	s.AddTool(mcp.NewTool("list_crds",
		mcp.WithDescription("List all CustomResourceDefinitions installed in the cluster"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("group", mcp.Description("Filter by API group, e.g. karpenter.sh or traefik.io")),
	), handleListCRDs)

	s.AddTool(mcp.NewTool("get_metrics",
		mcp.WithDescription("Get CPU and memory usage metrics for pods or nodes (requires metrics-server)"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind: pods or nodes")),
		mcp.WithString("namespace", mcp.Description("Namespace filter for pods (omit for all namespaces)")),
	), handleGetMetrics)
}

// stripItems removes verbose fields from a list of k8s objects before returning
// them to the AI. managedFields is boilerplate noise; status.images on nodes
// lists every container image pulled on the node and can be thousands of lines.
func stripItems(data interface{}) interface{} {
	b, err := json.Marshal(data)
	if err != nil {
		return data
	}
	var items []map[string]interface{}
	if err := json.Unmarshal(b, &items); err != nil {
		return data
	}
	for _, item := range items {
		if meta, ok := item["metadata"].(map[string]interface{}); ok {
			delete(meta, "managedFields")
		}
		if status, ok := item["status"].(map[string]interface{}); ok {
			delete(status, "images") // node images list — can be 100+ entries
		}
	}
	return items
}

// resolveGVR finds the GroupVersionResource for a given plural resource name
// by walking the server's preferred API resources via discovery.
func resolveGVR(resource string) (schema.GroupVersionResource, error) {
	lists, err := bundle.Discovery.ServerPreferredResources()
	if err != nil && lists == nil {
		return schema.GroupVersionResource{}, err
	}
	for _, list := range lists {
		gv, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}
		for _, r := range list.APIResources {
			if r.Name == resource {
				return schema.GroupVersionResource{Group: gv.Group, Version: gv.Version, Resource: r.Name}, nil
			}
		}
	}
	return schema.GroupVersionResource{}, fmt.Errorf("resource %q not found in cluster API groups", resource)
}

// listDynamic lists any resource via the dynamic client — fallback for CRDs
// not covered by the typed switch in ops.ListResource.
func listDynamic(ctx context.Context, resource, ns string, lo metav1.ListOptions) (interface{}, error) {
	gvr, err := resolveGVR(resource)
	if err != nil {
		return nil, err
	}
	list, err := bundle.DynClient.Resource(gvr).Namespace(ns).List(ctx, lo)
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

func handleListResources(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	resource := argStr(req, "resource")
	ns := argStr(req, "namespace")
	ls := argStr(req, "label_selector")
	limit := int64(100)
	if l, ok := argFloat(req, "limit"); ok {
		limit = int64(l)
	}
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	lo := metav1.ListOptions{LabelSelector: ls, Limit: limit}
	data, err := ops.ListResource(apiCtx, bundle, resource, ns, lo)
	if err != nil && errors.Is(err, ops.ErrUnsupportedResource) {
		data, err = listDynamic(apiCtx, resource, ns, lo)
	}
	if err != nil {
		return errResult(err), nil
	}
	return jsonResult(stripItems(data))
}

// stripSingle removes verbose fields from a single k8s object.
func stripSingle(data interface{}) interface{} {
	b, err := json.Marshal(data)
	if err != nil {
		return data
	}
	var item map[string]interface{}
	if err := json.Unmarshal(b, &item); err != nil {
		return data
	}
	if meta, ok := item["metadata"].(map[string]interface{}); ok {
		delete(meta, "managedFields")
	}
	if status, ok := item["status"].(map[string]interface{}); ok {
		delete(status, "images")
	}
	return item
}

// getDynamic fetches a single resource by name via the dynamic client.
func getDynamic(ctx context.Context, resource, name, ns string) (interface{}, error) {
	gvr, err := resolveGVR(resource)
	if err != nil {
		return nil, err
	}
	obj, err := bundle.DynClient.Resource(gvr).Namespace(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return obj.Object, nil
}

func handleGetResource(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	resource := argStr(req, "resource")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	data, err := ops.GetResource(apiCtx, bundle, resource, name, ns)
	if err != nil && errors.Is(err, ops.ErrUnsupportedResource) {
		data, err = getDynamic(apiCtx, resource, name, ns)
	}
	if err != nil {
		return errResult(err), nil
	}
	return jsonResult(stripSingle(data))
}

func handleGetResourceYAML(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	resource := argStr(req, "resource")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	data, err := ops.GetResource(apiCtx, bundle, resource, name, ns)
	if err != nil && errors.Is(err, ops.ErrUnsupportedResource) {
		data, err = getDynamic(apiCtx, resource, name, ns)
	}
	if err != nil {
		return errResult(err), nil
	}
	yamlBytes, err := yaml.Marshal(stripSingle(data))
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(string(yamlBytes)), nil
}

func handleGetPodLogs(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pod := argStr(req, "pod")
	ns := argStr(req, "namespace")
	container := argStr(req, "container")
	previous := argBool(req, "previous")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	opts := &corev1.PodLogOptions{
		Container: container,
		Previous:  previous,
	}
	if m, ok := argFloat(req, "since_minutes"); ok && m > 0 {
		secs := int64(m * 60)
		opts.SinceSeconds = &secs
	} else {
		tail := int64(100)
		if t, ok := argFloat(req, "tail"); ok {
			tail = int64(t)
		}
		opts.TailLines = &tail
	}

	stream, err := bundle.Clientset.CoreV1().Pods(ns).GetLogs(pod, opts).Stream(apiCtx)
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(readLogStream(stream, maxLogBytes)), nil
}

func handleListEvents(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	ns := argStr(req, "namespace")
	eventType := argStr(req, "type")
	objectName := argStr(req, "object_name")
	limit := 100
	if l, ok := argFloat(req, "limit"); ok && l > 0 {
		limit = int(l)
	}
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	var fieldSelectors []string
	if eventType != "" {
		fieldSelectors = append(fieldSelectors, "type="+eventType)
	}
	if objectName != "" {
		fieldSelectors = append(fieldSelectors, "involvedObject.name="+objectName)
	}
	lo := metav1.ListOptions{}
	if len(fieldSelectors) > 0 {
		lo.FieldSelector = strings.Join(fieldSelectors, ",")
	}

	list, err := bundle.Clientset.CoreV1().Events(ns).List(apiCtx, lo)
	if err != nil {
		return errResult(err), nil
	}

	// Sort by most recent first.
	sort.Slice(list.Items, func(i, j int) bool {
		return list.Items[i].LastTimestamp.After(list.Items[j].LastTimestamp.Time)
	})

	cap := limit
	if cap > len(list.Items) {
		cap = len(list.Items)
	}
	events := make([]eventSummary, 0, cap)
	for _, e := range list.Items[:cap] {
		events = append(events, summarizeEvent(e))
	}
	return jsonResult(events)
}

func handleListContexts(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	cfg, err := clientcmd.LoadFromFile(bundle.Kubeconfig)
	if err != nil {
		return errResult(err), nil
	}
	names := make([]string, 0, len(cfg.Contexts))
	for name := range cfg.Contexts {
		names = append(names, name)
	}
	// bundle.ContextName is what the server actually connected with at startup —
	// authoritative even if the kubeconfig file was edited after launch.
	return jsonResult(map[string]interface{}{
		"contexts": names,
		"current":  bundle.ContextName,
	})
}

func handleGetCurrentContext(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return mcp.NewToolResultText(bundle.ContextName), nil
}

func handleListNamespaces(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	list, err := bundle.Clientset.CoreV1().Namespaces().List(apiCtx, metav1.ListOptions{})
	if err != nil {
		return errResult(err), nil
	}
	names := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		names = append(names, ns.Name)
	}
	return jsonResult(names)
}

func handleHelmList(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	ns := argStr(req, "namespace")
	releases, err := helm.ListReleases(bundle.Kubeconfig, bundle.ContextName, ns)
	if err != nil {
		return errResult(err), nil
	}
	return jsonResult(releases)
}

func handleHelmStatus(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	release := argStr(req, "release")
	ns := argStr(req, "namespace")
	status, err := helm.GetReleaseStatus(bundle.Kubeconfig, bundle.ContextName, ns, release)
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(status), nil
}

func handleHelmValues(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	release := argStr(req, "release")
	ns := argStr(req, "namespace")
	all := argBool(req, "all")
	values, err := helm.GetReleaseValues(bundle.Kubeconfig, bundle.ContextName, ns, release, all)
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(values), nil
}

// securityFinding represents a single security issue found during a pod scan.
type securityFinding struct {
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Issue     string `json:"issue"`
	Severity  string `json:"severity"`
}

// scanPods inspects pod security posture and returns a list of findings.
// Extracted for testability — handler calls this after fetching pods from the API.
func scanPods(pods []corev1.Pod) []securityFinding {
	var findings []securityFinding
	for _, pod := range pods {
		psc := pod.Spec.SecurityContext // pod-level context, may be nil
		for _, c := range pod.Spec.Containers {
			sc := c.SecurityContext
			if sc == nil {
				findings = append(findings, securityFinding{pod.Name, c.Name, "No SecurityContext set", "WARN"})
				// Still check pod-level for root even without container-level sc.
				if psc != nil && psc.RunAsUser != nil && *psc.RunAsUser == 0 {
					findings = append(findings, securityFinding{pod.Name, c.Name, "Running as root (pod-level)", "HIGH"})
				}
				continue
			}
			if sc.Privileged != nil && *sc.Privileged {
				findings = append(findings, securityFinding{pod.Name, c.Name, "Privileged container", "CRITICAL"})
			}
			// RunAsNonRoot and RunAsUser: container-level overrides pod-level per k8s spec.
			runAsNonRoot := sc.RunAsNonRoot
			if runAsNonRoot == nil && psc != nil {
				runAsNonRoot = psc.RunAsNonRoot
			}
			runAsUser := sc.RunAsUser
			if runAsUser == nil && psc != nil {
				runAsUser = psc.RunAsUser
			}
			if (runAsNonRoot == nil || !*runAsNonRoot) && (runAsUser == nil || *runAsUser == 0) {
				findings = append(findings, securityFinding{pod.Name, c.Name, "Running as root", "HIGH"})
			}
			// Resource limits: flag containers with no CPU or memory limit set.
			if c.Resources.Limits == nil || (c.Resources.Limits.Cpu().IsZero() && c.Resources.Limits.Memory().IsZero()) {
				findings = append(findings, securityFinding{pod.Name, c.Name, "No resource limits set", "WARN"})
			}
		}
		if pod.Spec.HostNetwork {
			findings = append(findings, securityFinding{pod.Name, "*", "Host networking enabled", "HIGH"})
		}
		if pod.Spec.HostPID {
			findings = append(findings, securityFinding{pod.Name, "*", "Host PID namespace enabled", "HIGH"})
		}
		if pod.Spec.HostIPC {
			findings = append(findings, securityFinding{pod.Name, "*", "Host IPC namespace enabled", "HIGH"})
		}
	}
	return findings
}

func handleSecurityScan(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	pods, err := bundle.Clientset.CoreV1().Pods(ns).List(apiCtx, metav1.ListOptions{})
	if err != nil {
		return errResult(err), nil
	}
	findings := scanPods(pods.Items)
	return jsonResult(map[string]interface{}{
		"namespace": ns, "pods_scanned": len(pods.Items),
		"findings": findings, "total_issues": len(findings),
	})
}

func handleDetectProviders(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	icList, _ := bundle.Clientset.NetworkingV1().IngressClasses().List(apiCtx, metav1.ListOptions{})
	var items []networkingv1.IngressClass
	if icList != nil {
		items = icList.Items
	}
	ps := providers.Detect(bundle.Clientset.Discovery(), items)
	return jsonResult(ps)
}

func handleScaleResource(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := argStr(req, "kind")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	r, ok := argFloat(req, "replicas")
	if !ok {
		return errResult(fmt.Errorf("replicas argument is required")), nil
	}
	if r < 0 {
		return errResult(fmt.Errorf("replicas must be >= 0, got %v", r)), nil
	}
	replicas := int32(r)
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.Scale(apiCtx, bundle, ns, kind, name, replicas); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Scaled %s/%s to %d replicas in namespace %s", kind, name, replicas, ns)), nil
}

func handleDeleteResource(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := argStr(req, "kind")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.Delete(apiCtx, bundle, ns, kind, name); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Deleted %s/%s from namespace %s", kind, name, ns)), nil
}

func handleRolloutRestart(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := argStr(req, "kind")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.RolloutRestart(apiCtx, bundle, ns, kind, name); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Restarted %s/%s in namespace %s", kind, name, ns)), nil
}

func handleRolloutUndo(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := argStr(req, "kind")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	revision := int64(0)
	if r, ok := argFloat(req, "revision"); ok {
		revision = int64(r)
	}
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.RolloutUndo(apiCtx, bundle, ns, kind, name, revision); err != nil {
		return errResult(err), nil
	}
	msg := fmt.Sprintf("Rolled back %s/%s to previous revision in namespace %s", kind, name, ns)
	if revision > 0 {
		msg = fmt.Sprintf("Rolled back %s/%s to revision %d in namespace %s", kind, name, revision, ns)
	}
	return mcp.NewToolResultText(msg), nil
}

func handleApplyYAML(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	yamlContent := argStr(req, "yaml")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.ApplyYAML(apiCtx, bundle, []byte(yamlContent)); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText("Applied YAML manifest successfully"), nil
}

func handleHelmRollback(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	release := argStr(req, "release")
	ns := argStr(req, "namespace")
	revision := 0
	if r, ok := argFloat(req, "revision"); ok {
		revision = int(r)
	}
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	_ = apiCtx // helm SDK manages its own timeout internally; apiCtx provides cancellation
	if err := helm.RollbackRelease(bundle.Kubeconfig, bundle.ContextName, ns, release, revision); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Rolled back Helm release %s in namespace %s", release, ns)), nil
}

func handlePodSummary(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pod := argStr(req, "pod")
	ns := argStr(req, "namespace")
	tail := int64(50)
	if t, ok := argFloat(req, "tail"); ok {
		tail = int64(t)
	}
	previous := argBool(req, "previous")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	p, err := bundle.Clientset.CoreV1().Pods(ns).Get(apiCtx, pod, metav1.GetOptions{})
	if err != nil {
		return errResult(err), nil
	}

	type containerState struct {
		Name    string `json:"name"`
		Ready   bool   `json:"ready"`
		State   string `json:"state"`
		Reason  string `json:"reason,omitempty"`
		Message string `json:"message,omitempty"`
	}
	containerStates := make([]containerState, 0, len(p.Status.ContainerStatuses))
	for _, cs := range p.Status.ContainerStatuses {
		s := containerState{Name: cs.Name, Ready: cs.Ready}
		switch {
		case cs.State.Running != nil:
			s.State = "Running"
		case cs.State.Waiting != nil:
			s.State = "Waiting"
			s.Reason = cs.State.Waiting.Reason
			s.Message = cs.State.Waiting.Message
		case cs.State.Terminated != nil:
			s.State = "Terminated"
			s.Reason = cs.State.Terminated.Reason
			s.Message = cs.State.Terminated.Message
		}
		containerStates = append(containerStates, s)
	}

	eventList, _ := bundle.Clientset.CoreV1().Events(ns).List(apiCtx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=Pod", pod),
	})
	recentEvents := make([]eventSummary, 0)
	if eventList != nil {
		for _, e := range eventList.Items {
			recentEvents = append(recentEvents, summarizeEvent(e))
		}
	}

	// Fetch logs for all containers concurrently.
	containerLogs := make(map[string]string, len(p.Spec.Containers))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, c := range p.Spec.Containers {
		wg.Add(1)
		go func(containerName string) {
			defer wg.Done()
			stream, streamErr := logs.StreamLogs(bundle.Clientset, apiCtx, ns, pod, containerName, tail, false, previous)
			var output string
			if streamErr != nil {
				output = fmt.Sprintf("[error fetching logs: %v]", streamErr)
			} else {
				output = readLogStream(stream, maxLogBytesPerContainer)
			}
			mu.Lock()
			containerLogs[containerName] = output
			mu.Unlock()
		}(c.Name)
	}
	wg.Wait()

	type condition struct {
		Type    string `json:"type"`
		Status  string `json:"status"`
		Reason  string `json:"reason,omitempty"`
		Message string `json:"message,omitempty"`
	}
	conditions := make([]condition, 0, len(p.Status.Conditions))
	for _, c := range p.Status.Conditions {
		conditions = append(conditions, condition{
			Type:    string(c.Type),
			Status:  string(c.Status),
			Reason:  c.Reason,
			Message: c.Message,
		})
	}

	return jsonResult(map[string]interface{}{
		"pod":            pod,
		"namespace":      ns,
		"phase":          string(p.Status.Phase),
		"conditions":     conditions,
		"containers":     containerStates,
		"events":         recentEvents,
		"container_logs": containerLogs,
	})
}

func handleClusterHealth(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	// Fetch nodes, pods, and warning events concurrently — all are independent.
	var (
		nodeList  *corev1.NodeList
		podList   *corev1.PodList
		eventList *corev1.EventList
		nodeErr   error
		podErr    error
	)
	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		nodeList, nodeErr = bundle.Clientset.CoreV1().Nodes().List(apiCtx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		podList, podErr = bundle.Clientset.CoreV1().Pods("").List(apiCtx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		eventList, _ = bundle.Clientset.CoreV1().Events("").List(apiCtx, metav1.ListOptions{
			FieldSelector: "type=Warning",
		})
	}()
	wg.Wait()

	if nodeErr != nil {
		return errResult(nodeErr), nil
	}
	if podErr != nil {
		return errResult(podErr), nil
	}

	nodesReady, nodesTotal := 0, len(nodeList.Items)
	for _, n := range nodeList.Items {
		for _, c := range n.Status.Conditions {
			if c.Type == corev1.NodeReady && c.Status == corev1.ConditionTrue {
				nodesReady++
			}
		}
	}

	podsByPhase := map[string]int{}
	for _, p := range podList.Items {
		podsByPhase[string(p.Status.Phase)]++
	}

	cutoff := time.Now().Add(-1 * time.Hour)
	type healthEvent struct {
		Namespace string `json:"namespace,omitempty"`
		Reason    string `json:"reason"`
		Object    string `json:"object,omitempty"`
		Message   string `json:"message"`
		Count     int32  `json:"count"`
		LastSeen  string `json:"lastSeen"`
	}
	const maxHealthEvents = 50
	warnEvents := make([]healthEvent, 0, maxHealthEvents)
	if eventList != nil {
		for _, e := range eventList.Items {
			if len(warnEvents) >= maxHealthEvents {
				break
			}
			if e.LastTimestamp.After(cutoff) {
				warnEvents = append(warnEvents, healthEvent{
					Namespace: e.Namespace,
					Reason:    e.Reason,
					Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
					Message:   e.Message,
					Count:     e.Count,
					LastSeen:  e.LastTimestamp.Format(time.RFC3339),
				})
			}
		}
	}

	result := map[string]interface{}{
		"nodes": map[string]int{
			"ready": nodesReady,
			"total": nodesTotal,
		},
		"pods":           podsByPhase,
		"warning_events": warnEvents,
	}
	if len(warnEvents) == maxHealthEvents {
		result["warning_events_truncated"] = true
	}
	return jsonResult(result)
}

func handleListFailingPods(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	podList, err := bundle.Clientset.CoreV1().Pods(ns).List(apiCtx, metav1.ListOptions{})
	if err != nil {
		return errResult(err), nil
	}

	type failingContainer struct {
		Name     string `json:"name"`
		State    string `json:"state"`
		Reason   string `json:"reason,omitempty"`
		Message  string `json:"message,omitempty"`
		Restarts int32  `json:"restarts"`
	}
	type failingPod struct {
		Name       string             `json:"name"`
		Namespace  string             `json:"namespace"`
		Phase      string             `json:"phase"`
		Reason     string             `json:"reason,omitempty"`
		Message    string             `json:"message,omitempty"`
		Containers []failingContainer `json:"containers"`
		Age        string             `json:"age"`
	}

	var failing []failingPod
	for _, p := range podList.Items {
		phase := string(p.Status.Phase)
		if phase == "Running" || phase == "Succeeded" {
			// Still include Running pods with restarting containers.
			hasProblematic := false
			for _, cs := range p.Status.ContainerStatuses {
				if cs.State.Waiting != nil || (!cs.Ready && p.Status.Phase == corev1.PodRunning) {
					hasProblematic = true
					break
				}
			}
			if !hasProblematic {
				continue
			}
		}

		fp := failingPod{
			Name:      p.Name,
			Namespace: p.Namespace,
			Phase:     phase,
			Reason:    p.Status.Reason,
			Message:   p.Status.Message,
			Age:       p.CreationTimestamp.Format(time.RFC3339),
		}
		for _, cs := range p.Status.ContainerStatuses {
			fc := failingContainer{Name: cs.Name, Restarts: cs.RestartCount}
			switch {
			case cs.State.Waiting != nil:
				fc.State = "Waiting"
				fc.Reason = cs.State.Waiting.Reason
				fc.Message = cs.State.Waiting.Message
			case cs.State.Terminated != nil:
				fc.State = "Terminated"
				fc.Reason = cs.State.Terminated.Reason
				fc.Message = cs.State.Terminated.Message
			case cs.State.Running != nil && !cs.Ready:
				fc.State = "Running/NotReady"
			}
			if fc.State != "" {
				fp.Containers = append(fp.Containers, fc)
			}
		}
		failing = append(failing, fp)
	}

	return jsonResult(map[string]interface{}{
		"total_failing": len(failing),
		"pods":          failing,
	})
}

func handleGetResourceEvents(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := argStr(req, "kind")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	// Capitalise kind for field selector (k8s stores it as e.g. "Pod", "Deployment")
	if len(kind) > 0 {
		kind = strings.ToUpper(kind[:1]) + kind[1:]
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=%s", name, kind)
	if ns != "" {
		fieldSelector += fmt.Sprintf(",involvedObject.namespace=%s", ns)
	}

	list, err := bundle.Clientset.CoreV1().Events(ns).List(apiCtx, metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return errResult(err), nil
	}

	events := make([]eventSummary, 0, len(list.Items))
	for _, e := range list.Items {
		events = append(events, summarizeEvent(e))
	}
	return jsonResult(map[string]interface{}{
		"kind":   kind,
		"name":   name,
		"events": events,
	})
}

func handleListCRDs(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	group := argStr(req, "group")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	list, err := bundle.ApiextClient.ApiextensionsV1().CustomResourceDefinitions().List(apiCtx, metav1.ListOptions{})
	if err != nil {
		return errResult(err), nil
	}

	crds := make([]crdSummary, 0, len(list.Items))
	for _, c := range list.Items {
		if group != "" && c.Spec.Group != group {
			continue
		}
		ver := ""
		if len(c.Spec.Versions) > 0 {
			ver = c.Spec.Versions[0].Name
		}
		crds = append(crds, crdSummary{
			Name:    c.Name,
			Group:   c.Spec.Group,
			Kind:    c.Spec.Names.Kind,
			Plural:  c.Spec.Names.Plural,
			Scope:   string(c.Spec.Scope),
			Version: ver,
		})
	}
	return jsonResult(crds)
}

func handleGetMetrics(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := strings.ToLower(argStr(req, "kind"))
	ns := argStr(req, "namespace")
	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	cs, ok := bundle.Clientset.(*kubernetes.Clientset)
	if !ok {
		return errResult(fmt.Errorf("metrics unavailable: clientset does not support REST")), nil
	}

	var path string
	switch kind {
	case "pods":
		if ns != "" {
			path = "/apis/metrics.k8s.io/v1beta1/namespaces/" + ns + "/pods"
		} else {
			path = "/apis/metrics.k8s.io/v1beta1/pods"
		}
	case "nodes":
		path = "/apis/metrics.k8s.io/v1beta1/nodes"
	default:
		return errResult(fmt.Errorf("unsupported kind %q — use pods or nodes", kind)), nil
	}

	data, err := cs.RESTClient().Get().AbsPath(path).DoRaw(apiCtx)
	if err != nil {
		return errResult(fmt.Errorf("metrics unavailable (is metrics-server installed?): %v", err)), nil
	}

	var buf bytes.Buffer
	if err := json.Indent(&buf, data, "", "  "); err != nil {
		return mcp.NewToolResultText(string(data)), nil
	}
	return mcp.NewToolResultText(buf.String()), nil
}

func errResult(err error) *mcp.CallToolResult {
	return mcp.NewToolResultError(err.Error())
}

// stripManagedFields removes managedFields from marshaled k8s objects to reduce response size.
// managedFields can account for 60-70% of the JSON payload and are rarely useful to an AI assistant.
func stripManagedFields(data interface{}) interface{} {
	b, err := json.Marshal(data)
	if err != nil {
		return data
	}
	var m interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return data
	}
	stripManagedFieldsRec(m)
	return m
}

func stripManagedFieldsRec(v interface{}) {
	switch val := v.(type) {
	case map[string]interface{}:
		delete(val, "managedFields")
		for _, child := range val {
			stripManagedFieldsRec(child)
		}
	case []interface{}:
		for _, item := range val {
			stripManagedFieldsRec(item)
		}
	}
}

func jsonResult(data interface{}) (*mcp.CallToolResult, error) {
	b, err := json.MarshalIndent(stripManagedFields(data), "", "  ")
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(string(b)), nil
}
