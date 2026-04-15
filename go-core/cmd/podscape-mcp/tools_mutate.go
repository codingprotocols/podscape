package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/podscape/go-core/internal/client"
	"github.com/podscape/go-core/internal/exec"
	"github.com/podscape/go-core/internal/helm"
	"github.com/podscape/go-core/internal/ops"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	k8sexec "k8s.io/client-go/util/exec"
)

func registerMutateTools(s *server.MCPServer) {
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
		mcp.WithDescription("Delete a Kubernetes resource. Call without confirm=true first to see what will be deleted, then call again with confirm=true to proceed."),
		mcp.WithDestructiveHintAnnotation(true),
		mcp.WithString("kind", mcp.Required(), mcp.Description("Resource kind (pod, deployment, service, etc.)")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Resource name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithBoolean("confirm", mcp.Description("Must be true to actually delete. Omit or set false to preview what will be deleted.")),
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

	s.AddTool(mcp.NewTool("cordon_node",
		mcp.WithDescription("Cordon or uncordon a node (prevent/allow new pod scheduling)"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithIdempotentHintAnnotation(true),
		mcp.WithString("name", mcp.Required(), mcp.Description("Node name")),
		mcp.WithBoolean("unschedulable", mcp.Required(), mcp.Description("true = cordon (prevent new pods), false = uncordon")),
	), handleCordonNode)

	s.AddTool(mcp.NewTool("drain_node",
		mcp.WithDescription("Evict all pods from a node to prepare it for maintenance. Call without confirm=true first to see how many pods will be evicted, then call again with confirm=true to proceed."),
		mcp.WithDestructiveHintAnnotation(true),
		mcp.WithString("name", mcp.Required(), mcp.Description("Node name")),
		mcp.WithBoolean("force", mcp.Description("Delete pods not managed by a controller (default false)")),
		mcp.WithBoolean("ignore_daemonsets", mcp.Description("Skip DaemonSet-managed pods (default true)")),
		mcp.WithBoolean("delete_emptydir_data", mcp.Description("Allow eviction of pods with emptyDir volumes (default false)")),
		mcp.WithBoolean("confirm", mcp.Description("Must be true to actually drain. Omit or set false to preview which pods would be evicted.")),
	), handleDrainNode)

	s.AddTool(mcp.NewTool("trigger_cronjob",
		mcp.WithDescription("Manually trigger a CronJob by creating a Job from its template"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("name", mcp.Required(), mcp.Description("CronJob name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
	), handleTriggerCronJob)

	s.AddTool(mcp.NewTool("exec_command",
		mcp.WithDescription("Execute a command inside a running pod container and return combined stdout+stderr — for one-shot commands (ls, env, cat /path, ps aux)"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("pod", mcp.Required(), mcp.Description("Pod name")),
		mcp.WithString("namespace", mcp.Required(), mcp.Description("Namespace")),
		mcp.WithString("container", mcp.Description("Container name (defaults to first container)")),
		mcp.WithArray("command", mcp.Required(), mcp.Description("Command and arguments, e.g. [\"ls\", \"-la\", \"/tmp\"]")),
	), handleExecCommand)

	s.AddTool(mcp.NewTool("switch_context",
		mcp.WithDescription("Switch to a different Kubernetes context (cluster) — all subsequent tool calls will use the new context"),
		mcp.WithDestructiveHintAnnotation(false),
		mcp.WithString("context", mcp.Required(), mcp.Description("Kubernetes context name (must exist in kubeconfig)")),
	), handleSwitchContext)
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.Scale(apiCtx, b, ns, kind, name, replicas); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Scaled %s/%s to %d replicas in namespace %s", kind, name, replicas, ns)), nil
}

func handleDeleteResource(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := argStr(req, "kind")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")
	confirm := argBool(req, "confirm")

	if !confirm {
		return mcp.NewToolResultText(fmt.Sprintf(
			"This will permanently delete %s/%s from namespace %s. Set confirm=true to proceed.",
			kind, name, ns,
		)), nil
	}

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.Delete(apiCtx, b, ns, kind, name); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Deleted %s/%s from namespace %s", kind, name, ns)), nil
}

func handleRolloutRestart(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	kind := argStr(req, "kind")
	name := argStr(req, "name")
	ns := argStr(req, "namespace")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.RolloutRestart(apiCtx, b, ns, kind, name); err != nil {
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.RolloutUndo(apiCtx, b, ns, kind, name, revision); err != nil {
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

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	if err := ops.ApplyYAML(apiCtx, b, []byte(yamlContent)); err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText("Applied YAML manifest successfully"), nil
}

func handleCordonNode(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name := argStr(req, "name")
	unschedulable := argBool(req, "unschedulable")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	patch := fmt.Sprintf(`{"spec":{"unschedulable":%v}}`, unschedulable)
	_, err := b.Clientset.CoreV1().Nodes().Patch(apiCtx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{})
	if err != nil {
		return errResult(err), nil
	}
	action := "cordoned"
	if !unschedulable {
		action = "uncordoned"
	}
	return mcp.NewToolResultText(fmt.Sprintf("Node %s %s", name, action)), nil
}

func handleDrainNode(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name := argStr(req, "name")
	force := argBool(req, "force")
	ignoreDaemonsets := argBoolDef(req, "ignore_daemonsets", true)
	deleteEmptydirData := argBool(req, "delete_emptydir_data")
	confirm := argBool(req, "confirm")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	drainCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	pods, err := b.Clientset.CoreV1().Pods("").List(drainCtx, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + name,
	})
	if err != nil {
		return errResult(err), nil
	}

	// Categorise pods the same way the drain logic does, for both preview and execution.
	type podAction struct {
		pod  corev1.Pod
		skip bool
	}
	var actions []podAction
	for _, pod := range pods.Items {
		skip := false
		if (ignoreDaemonsets && isDaemonSetPod(pod)) ||
			pod.Status.Phase == corev1.PodSucceeded ||
			pod.Status.Phase == corev1.PodFailed ||
			(!force && len(pod.OwnerReferences) == 0) ||
			(!deleteEmptydirData && podHasEmptyDir(pod)) {
			skip = true
		}
		actions = append(actions, podAction{pod: pod, skip: skip})
	}

	const drainPreviewCap = 50
	if !confirm {
		toEvict := 0
		toSkip := 0
		var evictNames []string
		for _, a := range actions {
			if a.skip {
				toSkip++
			} else {
				toEvict++
				if len(evictNames) < drainPreviewCap {
					evictNames = append(evictNames, fmt.Sprintf("%s/%s", a.pod.Namespace, a.pod.Name))
				}
			}
		}
		preview := map[string]interface{}{
			"node":          name,
			"would_evict":   toEvict,
			"would_skip":    toSkip,
			"pods_to_evict": evictNames,
			"message":       fmt.Sprintf("Set confirm=true to drain node %s (will evict %d pods, skip %d).", name, toEvict, toSkip),
		}
		if toEvict > drainPreviewCap {
			preview["truncated"] = true
		}
		return jsonResult(preview)
	}

	evicted, skipped, failed := 0, 0, 0
	var failReasons []string

	for _, a := range actions {
		if a.skip {
			skipped++
			continue
		}
		eviction := &policyv1.Eviction{
			ObjectMeta: metav1.ObjectMeta{Name: a.pod.Name, Namespace: a.pod.Namespace},
		}
		if err := b.Clientset.PolicyV1().Evictions(a.pod.Namespace).Evict(drainCtx, eviction); err != nil {
			failed++
			failReasons = append(failReasons, fmt.Sprintf("%s/%s: %v", a.pod.Namespace, a.pod.Name, err))
		} else {
			evicted++
		}
	}

	result := map[string]interface{}{
		"node":    name,
		"evicted": evicted,
		"skipped": skipped,
	}
	if failed > 0 {
		result["failed"] = failed
		result["failed_reasons"] = failReasons
	}
	return jsonResult(result)
}

func isDaemonSetPod(pod corev1.Pod) bool {
	for _, ref := range pod.OwnerReferences {
		if ref.Kind == "DaemonSet" {
			return true
		}
	}
	return false
}

func podHasEmptyDir(pod corev1.Pod) bool {
	for _, v := range pod.Spec.Volumes {
		if v.EmptyDir != nil {
			return true
		}
	}
	return false
}

func handleTriggerCronJob(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name := argStr(req, "name")
	ns := argStr(req, "namespace")

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	apiCtx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()

	cj, err := b.Clientset.BatchV1().CronJobs(ns).Get(apiCtx, name, metav1.GetOptions{})
	if err != nil {
		return errResult(err), nil
	}

	trueVal := true
	jobName := cronJobManualName(name)
	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: ns,
			Annotations: map[string]string{
				"cronjob.kubernetes.io/instantiate": "manual",
			},
			OwnerReferences: []metav1.OwnerReference{{
				APIVersion:         "batch/v1",
				Kind:               "CronJob",
				Name:               cj.Name,
				UID:                cj.UID,
				BlockOwnerDeletion: &trueVal,
				Controller:         &trueVal,
			}},
		},
		Spec: cj.Spec.JobTemplate.Spec,
	}

	created, err := b.Clientset.BatchV1().Jobs(ns).Create(apiCtx, job, metav1.CreateOptions{})
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf("Created job %s from cronjob %s in namespace %s", created.Name, name, ns)), nil
}

// cronJobManualName generates the job name for a manually triggered CronJob.
// Appends a 4-digit random suffix alongside the Unix timestamp so that two
// triggers within the same second produce distinct names.
func cronJobManualName(cronJobName string) string {
	return fmt.Sprintf("%s-manual-%d%04d", cronJobName, time.Now().Unix(), rand.Int31n(10000))
}

func handleExecCommand(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pod := argStr(req, "pod")
	ns := argStr(req, "namespace")
	container := argStr(req, "container")

	cmdArg, _ := args(req)["command"].([]interface{})
	if len(cmdArg) == 0 {
		return errResult(fmt.Errorf("command must be a non-empty array")), nil
	}
	command := make([]string, len(cmdArg))
	for i, c := range cmdArg {
		s, ok := c.(string)
		if !ok {
			return errResult(fmt.Errorf("command element %d is not a string", i)), nil
		}
		command[i] = s
	}

	bundleMu.RLock()
	defer bundleMu.RUnlock()
	b := bundle

	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if container == "" {
		p, err := b.Clientset.CoreV1().Pods(ns).Get(execCtx, pod, metav1.GetOptions{})
		if err != nil {
			return errResult(err), nil
		}
		if len(p.Spec.Containers) > 0 {
			container = p.Spec.Containers[0].Name
		}
	}

	var stdout, stderr bytes.Buffer
	err := exec.Exec(execCtx, b.Clientset, b.Config, ns, pod, container, command, nil, &stdout, &stderr, false)

	combined := stdout.String()
	if stderr.Len() > 0 {
		combined += stderr.String()
	}

	if err != nil {
		// A non-zero container exit is a normal operational result, not a tool
		// failure. Return the output with the exit code rather than errResult.
		var exitErr k8sexec.CodeExitError
		if errors.As(err, &exitErr) {
			return mcp.NewToolResultText(fmt.Sprintf("%s\n[exit code %d]", combined, exitErr.Code)), nil
		}
		return errResult(fmt.Errorf("%v\n%s", err, combined)), nil
	}
	return mcp.NewToolResultText(combined), nil
}

// handleSwitchContext validates and switches the active Kubernetes context.
// Validation runs before acquiring the write lock to keep the critical section short.
//
// Concurrent switch_context calls: MCP stdio transport serializes tool calls,
// so two switch_context requests cannot race in practice. If the transport ever
// becomes concurrent, two callers could both pass ValidateContext, both call
// InitWithContext, and both call helm.ClearCache — the second write wins and
// the first initialized bundle is silently discarded. This is safe (no corruption)
// but the first caller would receive a misleading success response.
func handleSwitchContext(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	contextName := argStr(req, "context")
	if contextName == "" {
		return errResult(fmt.Errorf("context name is required")), nil
	}

	bundleMu.RLock()
	kubeconfigPath := bundle.Kubeconfig
	bundleMu.RUnlock()

	if err := client.ValidateContext(kubeconfigPath, contextName); err != nil {
		return errResult(err), nil
	}

	newBundle, err := client.InitWithContext(kubeconfigPath, contextName)
	if err != nil {
		return errResult(fmt.Errorf("initializing context %q: %w", contextName, err)), nil
	}

	helm.ClearCache()

	bundleMu.Lock()
	bundle = newBundle
	bundleMu.Unlock()

	return mcp.NewToolResultText(fmt.Sprintf("Switched to context %s", contextName)), nil
}
