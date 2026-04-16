package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/podscape/go-core/internal/ops"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"sigs.k8s.io/yaml"
)

func registerReadTools(s *server.MCPServer) {
	s.AddTool(mcp.NewTool("list_resources",
		mcp.WithDescription("List Kubernetes resources by type — supports built-in types (pods, deployments, services, nodes, etc.) and any CRD by plural name (e.g. nodepools, virtualservices, ingressroutes)"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("resource", mcp.Required(), mcp.Description("Resource type: pods, deployments, services, nodes, namespaces, configmaps, secrets, etc.")),
		mcp.WithString("namespace", mcp.Description("Namespace filter (omit for all namespaces)")),
		mcp.WithString("label_selector", mcp.Description("Label selector filter, e.g. app=nginx or env=prod,tier=frontend")),
		mcp.WithString("field_selector", mcp.Description("Field selector filter, e.g. status.phase=Running or spec.nodeName=node-1")),
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
		mcp.WithDescription("Get full YAML manifest of a Kubernetes resource"),
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
		mcp.WithString("container", mcp.Description("Container name (defaults to first container)")),
		mcp.WithNumber("tail", mcp.Description("Number of lines to return (default 100); ignored when since_minutes is set")),
		mcp.WithNumber("since_minutes", mcp.Description("Return logs from the last N minutes (overrides tail)")),
		mcp.WithBoolean("previous", mcp.Description("Return logs from the previously terminated container instance")),
		mcp.WithBoolean("init_container", mcp.Description("When true, fetches logs from init containers instead of main containers")),
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
		mcp.WithDescription("List available Kubernetes contexts from kubeconfig"),
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

func handleListResources(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	resource := argStr(req, "resource")
	ns := argStr(req, "namespace")
	ls := argStr(req, "label_selector")
	fs := argStr(req, "field_selector")
	limit := int64(100)
	if l, ok := argFloat(req, "limit"); ok {
		limit = int64(l)
	}

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	lo := metav1.ListOptions{LabelSelector: ls, FieldSelector: fs, Limit: limit}
	data, err := ops.ListResource(apiCtx, b, resource, ns, lo)
	if err != nil && errors.Is(err, ops.ErrUnsupportedResource) {
		data, err = listDynamic(apiCtx, b, resource, ns, lo)
	}
	if err != nil {
		return errResult(err), nil
	}
	return jsonResult(stripItems(data))
}

func handleGetResource(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	resource := argStr(req, "resource")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	data, err := ops.GetResource(apiCtx, b, resource, name, ns)
	if err != nil && errors.Is(err, ops.ErrUnsupportedResource) {
		data, err = getDynamic(apiCtx, b, resource, name, ns)
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	data, err := ops.GetResource(apiCtx, b, resource, name, ns)
	if err != nil && errors.Is(err, ops.ErrUnsupportedResource) {
		data, err = getDynamic(apiCtx, b, resource, name, ns)
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
	initContainer := argBool(req, "init_container")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	if initContainer && container == "" {
		p, err := b.Clientset.CoreV1().Pods(ns).Get(apiCtx, pod, metav1.GetOptions{})
		if err != nil {
			return errResult(err), nil
		}
		if len(p.Spec.InitContainers) > 0 {
			container = p.Spec.InitContainers[0].Name
		}
	}

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

	stream, err := b.Clientset.CoreV1().Pods(ns).GetLogs(pod, opts).Stream(apiCtx)
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

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

	list, err := b.Clientset.CoreV1().Events(ns).List(apiCtx, lo)
	if err != nil {
		return errResult(err), nil
	}

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
	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	cfg, err := clientcmd.LoadFromFile(b.Kubeconfig)
	if err != nil {
		return errResult(err), nil
	}
	names := make([]string, 0, len(cfg.Contexts))
	for name := range cfg.Contexts {
		names = append(names, name)
	}
	return jsonResult(map[string]interface{}{
		"contexts": names,
		"current":  b.ContextName,
	})
}

func handleGetCurrentContext(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle
	return mcp.NewToolResultText(b.ContextName), nil
}

func handleListNamespaces(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	list, err := b.Clientset.CoreV1().Namespaces().List(apiCtx, metav1.ListOptions{})
	if err != nil {
		return errResult(err), nil
	}
	names := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		names = append(names, ns.Name)
	}
	return jsonResult(names)
}

func handleListCRDs(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	group := argStr(req, "group")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	list, err := b.ApiextClient.ApiextensionsV1().CustomResourceDefinitions().List(apiCtx, metav1.ListOptions{})
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	cs, ok := b.Clientset.(*kubernetes.Clientset)
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
