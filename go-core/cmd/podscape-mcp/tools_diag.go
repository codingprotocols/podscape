package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/podscape/go-core/internal/logs"
	"github.com/podscape/go-core/internal/ops"
	"github.com/podscape/go-core/internal/providers"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func registerDiagTools(s *server.MCPServer) {
	s.AddTool(mcp.NewTool("pod_summary",
		mcp.WithDescription("Get a combined summary of a pod's status, container states, recent events, and last N log lines — everything needed to diagnose a failing pod in one call"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("pod", mcp.Required(), mcp.Description("Pod name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithNumber("tail", mcp.Description("Log lines per container (default 50)")),
		mcp.WithBoolean("previous", mcp.Description("Fetch logs from the previously terminated container instance")),
	), handlePodSummary)

	s.AddTool(mcp.NewTool("cluster_health",
		mcp.WithDescription("Get a one-call cluster health overview: node ready/total counts, pod counts by phase, and Warning events from the last hour"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	), handleClusterHealth)

	s.AddTool(mcp.NewTool("list_failing_pods",
		mcp.WithDescription("List all pods not in Running or Succeeded state, with phase, reason, and container-level failure details"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("namespace", mcp.Description("Namespace filter (omit for all namespaces)")),
	), handleListFailingPods)

	s.AddTool(mcp.NewTool("get_resource_events",
		mcp.WithDescription("Get Kubernetes events for a specific named resource — equivalent to 'kubectl describe' events section"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind, e.g. Pod, Deployment, Node, Service")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Description("Namespace (omit for cluster-scoped resources)")),
	), handleGetResourceEvents)

	s.AddTool(mcp.NewTool("describe_resource",
		mcp.WithDescription("Get a resource and its events in one call — equivalent to 'kubectl describe' without the table formatting"),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("resource", mcp.Required(), mcp.Description("Resource type (plural), e.g. pods, deployments, services")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Description("Namespace (omit for cluster-scoped resources)")),
	), handleDescribeResource)

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
}

func handlePodSummary(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pod := argStr(req, "pod")
	ns := argStr(req, "namespace")
	tail := int64(50)
	if t, ok := argFloat(req, "tail"); ok {
		tail = int64(t)
	}
	previous := argBool(req, "previous")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	p, err := b.Clientset.CoreV1().Pods(ns).Get(apiCtx, pod, metav1.GetOptions{})
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

	eventList, _ := b.Clientset.CoreV1().Events(ns).List(apiCtx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=Pod", pod),
	})
	recentEvents := make([]eventSummary, 0)
	if eventList != nil {
		for _, e := range eventList.Items {
			recentEvents = append(recentEvents, summarizeEvent(e))
		}
	}

	// Fetch logs for main containers and init containers concurrently.
	// Init container names are prefixed with "init:" in the output map.
	type containerEntry struct {
		name   string
		mapKey string
	}
	allContainers := make([]containerEntry, 0, len(p.Spec.Containers)+len(p.Spec.InitContainers))
	for _, c := range p.Spec.Containers {
		allContainers = append(allContainers, containerEntry{c.Name, c.Name})
	}
	for _, c := range p.Spec.InitContainers {
		allContainers = append(allContainers, containerEntry{c.Name, "init:" + c.Name})
	}

	containerLogs := make(map[string]string, len(allContainers))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, c := range allContainers {
		wg.Add(1)
		go func(containerName, mapKey string) {
			defer wg.Done()
			stream, streamErr := logs.StreamLogs(b.Clientset, apiCtx, ns, pod, containerName, tail, false, previous)
			var output string
			if streamErr != nil {
				output = fmt.Sprintf("[error fetching logs: %v]", streamErr)
			} else {
				output = readLogStream(stream, maxLogBytesPerContainer)
			}
			mu.Lock()
			containerLogs[mapKey] = output
			mu.Unlock()
		}(c.name, c.mapKey)
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
	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

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
		nodeList, nodeErr = b.Clientset.CoreV1().Nodes().List(apiCtx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		podList, podErr = b.Clientset.CoreV1().Pods("").List(apiCtx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		eventList, _ = b.Clientset.CoreV1().Events("").List(apiCtx, metav1.ListOptions{
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
		"nodes":          map[string]int{"ready": nodesReady, "total": nodesTotal},
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	podList, err := b.Clientset.CoreV1().Pods(ns).List(apiCtx, metav1.ListOptions{})
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	if len(kind) > 0 {
		kind = strings.ToUpper(kind[:1]) + kind[1:]
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=%s", name, kind)
	if ns != "" {
		fieldSelector += fmt.Sprintf(",involvedObject.namespace=%s", ns)
	}

	list, err := b.Clientset.CoreV1().Events(ns).List(apiCtx, metav1.ListOptions{
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

func handleDescribeResource(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
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

	eventList, _ := b.Clientset.CoreV1().Events(ns).List(apiCtx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s", name),
	})
	events := make([]eventSummary, 0)
	if eventList != nil {
		for _, e := range eventList.Items {
			events = append(events, summarizeEvent(e))
		}
	}

	return jsonResult(map[string]interface{}{
		"resource": stripSingle(data),
		"events":   events,
	})
}

// scanPods inspects pod security posture and returns a list of findings.
// Extracted for testability.
func scanPods(pods []corev1.Pod) []securityFinding {
	dangerousCaps := map[corev1.Capability]bool{
		"NET_ADMIN": true, "SYS_ADMIN": true, "SYS_PTRACE": true, "ALL": true,
	}

	var findings []securityFinding
	for _, pod := range pods {
		psc := pod.Spec.SecurityContext
		for _, c := range pod.Spec.Containers {
			sc := c.SecurityContext
			if sc == nil {
				findings = append(findings, securityFinding{pod.Name, c.Name, "No SecurityContext set", "WARN"})
				if psc != nil && psc.RunAsUser != nil && *psc.RunAsUser == 0 {
					findings = append(findings, securityFinding{pod.Name, c.Name, "Running as root (pod-level)", "HIGH"})
				}
				continue
			}
			if sc.Privileged != nil && *sc.Privileged {
				findings = append(findings, securityFinding{pod.Name, c.Name, "Privileged container", "CRITICAL"})
			}
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
			if c.Resources.Limits == nil || (c.Resources.Limits.Cpu().IsZero() && c.Resources.Limits.Memory().IsZero()) {
				findings = append(findings, securityFinding{pod.Name, c.Name, "No resource limits set", "WARN"})
			}
			// Check 1: allowPrivilegeEscalation not explicitly set to false
			if sc.AllowPrivilegeEscalation == nil || *sc.AllowPrivilegeEscalation {
				findings = append(findings, securityFinding{pod.Name, c.Name, "allowPrivilegeEscalation not set to false", "WARN"})
			}
			// Check 2: readOnlyRootFilesystem not set to true
			if sc.ReadOnlyRootFilesystem == nil || !*sc.ReadOnlyRootFilesystem {
				findings = append(findings, securityFinding{pod.Name, c.Name, "readOnlyRootFilesystem not set to true", "WARN"})
			}
			// Check 3: dangerous capabilities
			if sc.Capabilities != nil {
				for _, cap := range sc.Capabilities.Add {
					if dangerousCaps[cap] {
						findings = append(findings, securityFinding{pod.Name, c.Name, fmt.Sprintf("Dangerous capability: %s", cap), "HIGH"})
					}
				}
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	pods, err := b.Clientset.CoreV1().Pods(ns).List(apiCtx, metav1.ListOptions{})
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
	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	icList, _ := b.Clientset.NetworkingV1().IngressClasses().List(apiCtx, metav1.ListOptions{})
	var items []networkingv1.IngressClass
	if icList != nil {
		items = icList.Items
	}
	ps := providers.Detect(b.Clientset.Discovery(), items)
	return jsonResult(ps)
}
