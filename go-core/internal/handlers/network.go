package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	networkingv1 "k8s.io/api/networking/v1"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/graph"
	"github.com/podscape/go-core/internal/logs"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/store"
	"github.com/podscape/go-core/internal/topology"
)

func HandleLogs(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	pod := r.URL.Query().Get("pod")
	namespace := r.URL.Query().Get("namespace")
	container := r.URL.Query().Get("container")
	tailStr := r.URL.Query().Get("tail")
	tail := int64(200)
	if tailStr != "" {
		if t, err := strconv.ParseInt(tailStr, 10, 64); err == nil {
			tail = t
		}
	}

	if pod == "" || namespace == "" {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: pod and namespace are required"))
		return
	}

	log.Printf("[HandleLogs] Starting stream for %s/%s/%s", namespace, pod, container)

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: no active context"))
		return
	}

	stream, err := logs.StreamLogs(cs, r.Context(), namespace, pod, container, tail, true, false)
	if err != nil {
		log.Printf("[HandleLogs] Failed to start log stream for %s/%s: %v", namespace, pod, err)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
		return
	}

	err = logs.CopyStream(stream, func(line []byte) error {
		return conn.WriteMessage(websocket.TextMessage, line)
	})

	if err != nil {
		log.Printf("[HandleLogs] Log streaming ended with error for %s/%s: %v", namespace, pod, err)
	} else {
		log.Printf("[HandleLogs] Log streaming ended normally for %s/%s", namespace, pod)
	}
}

func HandlePortForward(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	namespace := r.URL.Query().Get("namespace")
	resourceType := r.URL.Query().Get("type") // "pod" or "service"
	name := r.URL.Query().Get("name")
	// Legacy: callers that still send ?pod= are also supported.
	if name == "" {
		name = r.URL.Query().Get("pod")
	}
	localPortStr := r.URL.Query().Get("localPort")
	remotePortStr := r.URL.Query().Get("remotePort")

	localPort, err := strconv.Atoi(localPortStr)
	if err != nil || localPort <= 0 {
		http.Error(w, "invalid localPort: must be a positive integer", http.StatusBadRequest)
		return
	}
	remotePort, err := strconv.Atoi(remotePortStr)
	if err != nil || remotePort <= 0 {
		http.Error(w, "invalid remotePort: must be a positive integer", http.StatusBadRequest)
		return
	}

	if id == "" || namespace == "" || name == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	podName := name
	if resourceType == "service" {
		resolved, resolveErr := resolveServiceToPod(namespace, name)
		if resolveErr != nil {
			http.Error(w, resolveErr.Error(), http.StatusBadRequest)
			return
		}
		podName = resolved
	}

	if err = portforward.Manager.StartForward(id, namespace, podName, localPort, remotePort); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// resolveServiceToPod finds a ready pod that matches the given service's selector.
func resolveServiceToPod(namespace, serviceName string) (string, error) {
	c := store.Store.ActiveCache
	if c == nil {
		return "", fmt.Errorf("no active Kubernetes context")
	}
	c.RLock()
	svcRaw, ok := c.Services[namespace+"/"+serviceName]
	c.RUnlock()
	if !ok {
		return "", fmt.Errorf("service %s/%s not found in cache", namespace, serviceName)
	}
	svc, ok := svcRaw.(*corev1.Service)
	if !ok {
		return "", fmt.Errorf("unexpected type for service %s/%s", namespace, serviceName)
	}
	selector := svc.Spec.Selector
	if len(selector) == 0 {
		return "", fmt.Errorf("service %s/%s has no selector (headless or external)", namespace, serviceName)
	}

	c.RLock()
	defer c.RUnlock()
	for key, podRaw := range c.Pods {
		pod, ok := podRaw.(*corev1.Pod)
		if !ok {
			continue
		}
		// Must be in the same namespace.
		if pod.Namespace != namespace {
			continue
		}
		_ = key
		// Check all selector labels match.
		match := true
		for k, v := range selector {
			if pod.Labels[k] != v {
				match = false
				break
			}
		}
		if !match {
			continue
		}
		// Prefer Running + Ready pods.
		if pod.Status.Phase == corev1.PodRunning {
			for _, cond := range pod.Status.Conditions {
				if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
					return pod.Name, nil
				}
			}
		}
	}
	// Fall back to any pod matching the selector (may not be ready yet).
	for _, podRaw := range c.Pods {
		pod, ok := podRaw.(*corev1.Pod)
		if !ok || pod.Namespace != namespace {
			continue
		}
		match := true
		for k, v := range selector {
			if pod.Labels[k] != v {
				match = false
				break
			}
		}
		if match {
			return pod.Name, nil
		}
	}
	return "", fmt.Errorf("no pods found for service %s/%s", namespace, serviceName)
}

func HandleStopPortForward(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id parameter", http.StatusBadRequest)
		return
	}

	portforward.Manager.StopForward(id)
	w.WriteHeader(http.StatusOK)
}

// topologyCache holds a short-lived cached result per namespace key so that
// rapid successive requests (e.g. the network panel re-mounting) don't trigger
// a full store scan on every call.
var topoCache struct {
	sync.Mutex
	entries map[string]topoCacheEntry
}

func init() {
	topoCache.entries = make(map[string]topoCacheEntry)
}

type topoCacheEntry struct {
	topo    *topology.Topology
	builtAt time.Time
}

const topoCacheTTL = 5 * time.Second

// contextCacheWrapper implements graph.ResourceCache for store.ContextCache.
type contextCacheWrapper struct {
	cache *store.ContextCache
}

func (w *contextCacheWrapper) GetRawObject(kind graph.NodeKind, namespace, name string) (interface{}, bool) {
	w.cache.RLock()
	defer w.cache.RUnlock()

	key := namespace + "/" + name
	if namespace == "" {
		key = name
	}

	switch kind {
	case graph.KindPod:
		v, ok := w.cache.Pods[key]
		return v, ok
	case graph.KindService:
		v, ok := w.cache.Services[key]
		return v, ok
	case graph.KindWorkload: // covers Deployment, ReplicaSet, DaemonSet, StatefulSet, Job, CronJob
		if v, ok := w.cache.Deployments[key]; ok {
			return v, true
		}
		if v, ok := w.cache.ReplicaSets[key]; ok {
			return v, true
		}
		if v, ok := w.cache.DaemonSets[key]; ok {
			return v, true
		}
		if v, ok := w.cache.StatefulSets[key]; ok {
			return v, true
		}
		if v, ok := w.cache.Jobs[key]; ok {
			return v, true
		}
		if v, ok := w.cache.CronJobs[key]; ok {
			return v, true
		}
		return nil, false
	case graph.KindIngress:
		v, ok := w.cache.Ingresses[key]
		return v, ok
	case graph.KindPVC:
		v, ok := w.cache.PVCs[key]
		return v, ok
	case graph.KindNode:
		v, ok := w.cache.Nodes[key]
		return v, ok
	case graph.KindNetworkPolicy:
		v, ok := w.cache.NetworkPolicies[key]
		return v, ok
	}
	return nil, false
}

func HandleTopology(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")

	store.Store.RLock()
	ac := store.Store.ActiveCache
	store.Store.RUnlock()

	if ac == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// 1. Convert Cache (filtered by namespace) to Initial Nodes
	initialNodes := make([]graph.Node, 0)
	ac.RLock()
	
	// Add Pods
	for _, obj := range ac.Pods {
		p := obj.(*corev1.Pod)
		if ns != "" && p.Namespace != ns { continue }
		ownerUID := ""
		for _, o := range p.OwnerReferences { if o.Controller != nil && *o.Controller { ownerUID = string(o.UID); break } }
		initialNodes = append(initialNodes, graph.Node{
			ID: fmt.Sprintf("pod:%s", p.UID), Kind: graph.KindPod, Name: p.Name, Namespace: p.Namespace,
			Labels: p.Labels, UID: string(p.UID), Phase: string(p.Status.Phase),
			OwnerUID: ownerUID,
		})
	}
	// Add Services
	for _, obj := range ac.Services {
		s := obj.(*corev1.Service)
		if ns != "" && s.Namespace != ns { continue }
		ports := []string{}
		for _, p := range s.Spec.Ports { ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol)) }
		pNode := graph.Node{
			Kind: graph.KindService, Name: s.Name, Namespace: s.Namespace,
			Labels: s.Labels, ServiceType: string(s.Spec.Type), Ports: ports, UID: string(s.UID),
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add Deployments
	for _, obj := range ac.Deployments {
		d := obj.(*appsv1.Deployment)
		if ns != "" && d.Namespace != ns { continue }
		pNode := graph.Node{
			Kind: graph.KindDeployment, Name: d.Name, Namespace: d.Namespace,
			WorkloadKind: "Deployment", UID: string(d.UID), Labels: d.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add ReplicaSets
	for _, obj := range ac.ReplicaSets {
		rs := obj.(*appsv1.ReplicaSet)
		if ns != "" && rs.Namespace != ns { continue }
		ownerUID := ""
		for _, o := range rs.OwnerReferences { if o.Controller != nil && *o.Controller { ownerUID = string(o.UID); break } }
		pNode := graph.Node{
			Kind: graph.KindReplicaSet, Name: rs.Name, Namespace: rs.Namespace,
			WorkloadKind: "ReplicaSet", OwnerUID: ownerUID, UID: string(rs.UID), Labels: rs.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add DaemonSets
	for _, obj := range ac.DaemonSets {
		ds := obj.(*appsv1.DaemonSet)
		if ns != "" && ds.Namespace != ns { continue }
		pNode := graph.Node{
			Kind: graph.KindDaemonSet, Name: ds.Name, Namespace: ds.Namespace,
			WorkloadKind: "DaemonSet", UID: string(ds.UID), Labels: ds.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add StatefulSets
	for _, obj := range ac.StatefulSets {
		ss := obj.(*appsv1.StatefulSet)
		if ns != "" && ss.Namespace != ns { continue }
		pNode := graph.Node{
			Kind: graph.KindStatefulSet, Name: ss.Name, Namespace: ss.Namespace,
			WorkloadKind: "StatefulSet", UID: string(ss.UID), Labels: ss.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add Jobs
	for _, obj := range ac.Jobs {
		j := obj.(*batchv1.Job)
		if ns != "" && j.Namespace != ns { continue }
		pNode := graph.Node{
			Kind: graph.KindJob, Name: j.Name, Namespace: j.Namespace,
			WorkloadKind: "Job", UID: string(j.UID), Labels: j.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add CronJobs
	for _, obj := range ac.CronJobs {
		cj := obj.(*batchv1.CronJob)
		if ns != "" && cj.Namespace != ns { continue }
		pNode := graph.Node{
			Kind: graph.KindCronJob, Name: cj.Name, Namespace: cj.Namespace,
			WorkloadKind: "CronJob", UID: string(cj.UID), Labels: cj.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add Ingresses
	for _, obj := range ac.Ingresses {
		ing := obj.(*networkingv1.Ingress)
		if ns != "" && ing.Namespace != ns { continue }
		initialNodes = append(initialNodes, graph.Node{
			ID: fmt.Sprintf("ingress:%s:%s", ing.Namespace, ing.Name), Kind: graph.KindIngress, Name: ing.Name, Namespace: ing.Namespace,
		})
	}
	// Add PVCs
	for _, obj := range ac.PVCs {
		pvc := obj.(*corev1.PersistentVolumeClaim)
		if ns != "" && pvc.Namespace != ns { continue }
		pNode := graph.Node{
			Kind: graph.KindPVC, Name: pvc.Name, Namespace: pvc.Namespace,
			Phase: string(pvc.Status.Phase), UID: string(pvc.UID), Labels: pvc.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add Nodes
	for _, obj := range ac.Nodes {
		node := obj.(*corev1.Node)
		// Nodes are cluster-scoped, so no namespace filter applies to the node itself,
		// but we only include them if we are doing a cluster-wide view or if needed.
		// For feature parity with legacy BuildTopology, we always include them.
		pNode := graph.Node{
			Kind: graph.KindNode, Name: node.Name, UID: string(node.UID), Labels: node.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}
	// Add NetworkPolicies
	for _, obj := range ac.NetworkPolicies {
		np := obj.(*networkingv1.NetworkPolicy)
		if ns != "" && np.Namespace != ns { continue }
		pNode := graph.Node{
			Kind: graph.KindNetworkPolicy, Name: np.Name, Namespace: np.Namespace, UID: string(np.UID), Labels: np.Labels,
		}
		pNode.ID = pNode.ComputeID()
		initialNodes = append(initialNodes, pNode)
	}

	ac.RUnlock()

	// 2. Build Graph using the new Discovery Engine
	builder := graph.NewGraphBuilder(&contextCacheWrapper{cache: ac})
	g := builder.Build(initialNodes)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(g)
}

// sseEvent writes a single SSE event and flushes.
func sseEvent(w http.ResponseWriter, f http.Flusher, eventType, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, data)
	f.Flush()
}
