package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/graph"
	"github.com/podscape/go-core/internal/hubble"
	"github.com/podscape/go-core/internal/logs"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/store"
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

	// After the WebSocket upgrade gorilla hijacks the TCP connection, removing it
	// from net/http's tracking. r.Context() is therefore never cancelled when the
	// client disconnects, so we derive our own cancellable context and cancel it
	// from a read-pump goroutine that detects the WebSocket close frame.
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	previous := r.URL.Query().Get("previous") == "true"
	rawStream, err := logs.StreamLogs(cs, ctx, namespace, pod, container, tail, true, previous)
	if err != nil {
		log.Printf("[HandleLogs] Failed to start log stream for %s/%s: %v", namespace, pod, err)
		conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
		return
	}
	// Wrap in a once-closer so the read-pump and CopyStream's defer can both
	// call Close safely; only the first call closes the underlying stream.
	stream := logs.NewOnceCloser(rawStream)

	// writeMu serialises all conn.WriteMessage calls: gorilla/websocket requires
	// that at most one goroutine calls write methods concurrently.
	var writeMu sync.Mutex

	// Start read-pump after the stream is open so it can force-close the stream
	// on client disconnect. cancel() alone isn't sufficient: bufio.Reader.ReadBytes
	// does not poll ctx.Done(), so if the k8s HTTP transport is slow to abort the
	// chunked-transfer connection, CopyStream blocks until the OS TCP timeout.
	// stream.Close() guarantees ReadBytes unblocks immediately.
	//
	// The client (Node.js ws) sends no data frames back, so we drive keepalive
	// from the server: a ping is sent every 45 s and the pong handler resets a
	// 60 s read deadline. Only truly dead connections (no pong for 60 s) cancel
	// the stream; a silent-but-alive pod no longer causes a spurious termination.
	pingDone := make(chan struct{})
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})
	go func() {
		ticker := time.NewTicker(45 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				// WriteControl has its own internal lock and is safe for concurrent
			// use with WriteMessage — no need to hold writeMu here. Doing so
			// would block log writes for up to the 10-second deadline on dying
			// connections.
			werr := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(10*time.Second))
				if werr != nil {
					cancel()
					stream.Close()
					return
				}
			case <-pingDone:
				return
			}
		}
	}()
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				stream.Close()
				return
			}
		}
	}()

	err = logs.CopyStream(stream, func(line []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(websocket.TextMessage, line)
	})
	close(pingDone)
	conn.Close()

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
		store.Store.RLock()
		ac := store.Store.ActiveCache
		store.Store.RUnlock()
		resolved, resolveErr := resolveServiceToPod(ac, namespace, name)
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
// c must be non-nil; callers are responsible for reading it from store.Store.
func resolveServiceToPod(c *store.ContextCache, namespace, serviceName string) (string, error) {
	if c == nil {
		return "", fmt.Errorf("no active Kubernetes context")
	}
	c.RLock()
	svcRaw, ok := c.Services[store.ResourceKey(namespace, serviceName)]
	c.RUnlock()
	if !ok {
		return "", fmt.Errorf("service %q not found in namespace %q", serviceName, namespace)
	}
	svc, ok := svcRaw.(*corev1.Service)
	if !ok {
		return "", fmt.Errorf("service %q has unexpected type in cache", serviceName)
	}
	selector := svc.Spec.Selector
	if len(selector) == 0 {
		return "", fmt.Errorf("service %q has no selector (headless or external)", serviceName)
	}

	// Single pass: track both a Running+Ready candidate and any-match fallback
	// simultaneously so we never iterate c.Pods twice under the read-lock.
	c.RLock()
	defer c.RUnlock()
	var readyPod, anyPod string
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
		if !match {
			continue
		}
		if anyPod == "" {
			anyPod = pod.Name
		}
		if readyPod == "" && pod.Status.Phase == corev1.PodRunning {
			for _, cond := range pod.Status.Conditions {
				if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
					readyPod = pod.Name
					break
				}
			}
		}
		if readyPod != "" {
			break // best candidate found; no need to continue
		}
	}
	if readyPod != "" {
		return readyPod, nil
	}
	if anyPod != "" {
		return anyPod, nil
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

// HandlePortForwardAlive returns 200 when the forward with the given id is
// still running, or 404 when it has ended (pod died, context switch, etc.).
// The main Electron process polls this endpoint after portforward:ready to
// detect natural tunnel termination and emit portforward:exit to the renderer.
func HandlePortForwardAlive(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id parameter", http.StatusBadRequest)
		return
	}

	portforward.Manager.Lock()
	_, ok := portforward.Manager.Forwards[id]
	portforward.Manager.Unlock()

	if ok {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusNotFound)
	}
}

// snapshotCache is a zero-lock, point-in-time copy of the cache maps needed by
// graph discoverers. All maps are copied once under a single ac.RLock() call in
// HandleTopology, so GetRawObject never needs to acquire a lock. This eliminates
// N individual RLock/RUnlock pairs (one per discoverer lookup) and reduces lock
// contention on large clusters.
type snapshotCache struct {
	pods            map[string]interface{}
	services        map[string]interface{}
	workloads       map[string]interface{} // merged by name: Deployments > ReplicaSets > DaemonSets > StatefulSets > Jobs > CronJobs
	workloadsByUID  map[string]interface{} // indexed by UID — no name collision; used by OwnerDiscoverer
	ingresses       map[string]interface{}
	pvcs            map[string]interface{}
	nodes           map[string]interface{}
	networkPolicies map[string]interface{}
}

func (s *snapshotCache) GetRawObject(kind graph.NodeKind, namespace, name string) (interface{}, bool) {
	key := store.ResourceKey(namespace, name)
	switch kind {
	case graph.KindPod:
		v, ok := s.pods[key]
		return v, ok
	case graph.KindService:
		v, ok := s.services[key]
		return v, ok
	case graph.KindWorkload:
		v, ok := s.workloads[key]
		return v, ok
	case graph.KindIngress:
		v, ok := s.ingresses[key]
		return v, ok
	case graph.KindPVC:
		v, ok := s.pvcs[key]
		return v, ok
	case graph.KindNode:
		v, ok := s.nodes[key]
		return v, ok
	case graph.KindNetworkPolicy:
		v, ok := s.networkPolicies[key]
		return v, ok
	}
	return nil, false
}

func (s *snapshotCache) GetRawObjectByUID(uid string) (interface{}, bool) {
	v, ok := s.workloadsByUID[uid]
	return v, ok
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

	// 1. Convert cache entries to initial graph nodes via a type registry.
	// Each nodeSource pairs a cache map with a builder that casts, filters by
	// namespace, and returns the graph.Node. To add a new resource to the topology
	// add one entry here — no other code needs to change.
	// Copy all resource maps under a short-held read-lock, then release it.
	// All topology construction (node building, snap assembly) happens after
	// the unlock so informer write-callbacks (which need ac.Lock()) are never
	// starved by map iteration on large clusters.
	ac.RLock()
	allowedResources := ac.AllowedResources
	cpMap := func(src map[string]interface{}) map[string]interface{} {
		dst := make(map[string]interface{}, len(src))
		for k, v := range src {
			dst[k] = v
		}
		return dst
	}
	localPods         := cpMap(ac.Pods)
	localServices     := cpMap(ac.Services)
	localDeployments  := cpMap(ac.Deployments)
	localReplicaSets  := cpMap(ac.ReplicaSets)
	localDaemonSets   := cpMap(ac.DaemonSets)
	localStatefulSets := cpMap(ac.StatefulSets)
	localJobs         := cpMap(ac.Jobs)
	localCronJobs     := cpMap(ac.CronJobs)
	localIngresses    := cpMap(ac.Ingresses)
	localPVCs         := cpMap(ac.PVCs)
	localNodes        := cpMap(ac.Nodes)
	localNPs          := cpMap(ac.NetworkPolicies)
	ac.RUnlock()

	// 1. Convert cache entries to initial graph nodes via a type registry.
	// Each nodeSource pairs a cache map with a builder that casts, filters by
	// namespace, and returns the graph.Node. To add a new resource to the topology
	// add one entry here — no other code needs to change.
	type nodeSource struct {
		// resourceName is the k8s plural name used as the AllowedResources key.
		// An empty string means cluster-scoped or always-included (e.g. nodes).
		resourceName string
		cacheMap     map[string]interface{}
		build        func(obj interface{}) (graph.Node, bool)
	}

	sources := []nodeSource{
		{"pods", localPods, func(obj interface{}) (graph.Node, bool) {
			p := obj.(*corev1.Pod)
			if ns != "" && p.Namespace != ns {
				return graph.Node{}, false
			}
			ownerUID := ""
			for _, o := range p.OwnerReferences {
				if o.Controller != nil && *o.Controller {
					ownerUID = string(o.UID)
					break
				}
			}
			return graph.Node{
				ID: fmt.Sprintf("pod:%s", p.UID), Kind: graph.KindPod,
				Name: p.Name, Namespace: p.Namespace, Labels: p.Labels,
				UID: string(p.UID), Phase: string(p.Status.Phase), OwnerUID: ownerUID,
			}, true
		}},
		{"services", localServices, func(obj interface{}) (graph.Node, bool) {
			s := obj.(*corev1.Service)
			if ns != "" && s.Namespace != ns {
				return graph.Node{}, false
			}
			ports := make([]string, 0, len(s.Spec.Ports))
			for _, p := range s.Spec.Ports {
				ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
			}
			n := graph.Node{
				Kind: graph.KindService, Name: s.Name, Namespace: s.Namespace,
				Labels: s.Labels, ServiceType: string(s.Spec.Type), Ports: ports, UID: string(s.UID),
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"deployments", localDeployments, func(obj interface{}) (graph.Node, bool) {
			d := obj.(*appsv1.Deployment)
			if ns != "" && d.Namespace != ns {
				return graph.Node{}, false
			}
			n := graph.Node{
				Kind: graph.KindDeployment, Name: d.Name, Namespace: d.Namespace,
				WorkloadKind: "Deployment", UID: string(d.UID), Labels: d.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"replicasets", localReplicaSets, func(obj interface{}) (graph.Node, bool) {
			rs := obj.(*appsv1.ReplicaSet)
			if ns != "" && rs.Namespace != ns {
				return graph.Node{}, false
			}
			ownerUID := ""
			for _, o := range rs.OwnerReferences {
				if o.Controller != nil && *o.Controller {
					ownerUID = string(o.UID)
					break
				}
			}
			n := graph.Node{
				Kind: graph.KindReplicaSet, Name: rs.Name, Namespace: rs.Namespace,
				WorkloadKind: "ReplicaSet", OwnerUID: ownerUID, UID: string(rs.UID), Labels: rs.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"daemonsets", localDaemonSets, func(obj interface{}) (graph.Node, bool) {
			ds := obj.(*appsv1.DaemonSet)
			if ns != "" && ds.Namespace != ns {
				return graph.Node{}, false
			}
			n := graph.Node{
				Kind: graph.KindDaemonSet, Name: ds.Name, Namespace: ds.Namespace,
				WorkloadKind: "DaemonSet", UID: string(ds.UID), Labels: ds.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"statefulsets", localStatefulSets, func(obj interface{}) (graph.Node, bool) {
			ss := obj.(*appsv1.StatefulSet)
			if ns != "" && ss.Namespace != ns {
				return graph.Node{}, false
			}
			n := graph.Node{
				Kind: graph.KindStatefulSet, Name: ss.Name, Namespace: ss.Namespace,
				WorkloadKind: "StatefulSet", UID: string(ss.UID), Labels: ss.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"jobs", localJobs, func(obj interface{}) (graph.Node, bool) {
			j := obj.(*batchv1.Job)
			if ns != "" && j.Namespace != ns {
				return graph.Node{}, false
			}
			n := graph.Node{
				Kind: graph.KindJob, Name: j.Name, Namespace: j.Namespace,
				WorkloadKind: "Job", UID: string(j.UID), Labels: j.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"cronjobs", localCronJobs, func(obj interface{}) (graph.Node, bool) {
			cj := obj.(*batchv1.CronJob)
			if ns != "" && cj.Namespace != ns {
				return graph.Node{}, false
			}
			n := graph.Node{
				Kind: graph.KindCronJob, Name: cj.Name, Namespace: cj.Namespace,
				WorkloadKind: "CronJob", UID: string(cj.UID), Labels: cj.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"ingresses", localIngresses, func(obj interface{}) (graph.Node, bool) {
			ing := obj.(*networkingv1.Ingress)
			if ns != "" && ing.Namespace != ns {
				return graph.Node{}, false
			}
			return graph.Node{
				ID: fmt.Sprintf("ingress:%s:%s", ing.Namespace, ing.Name),
				Kind: graph.KindIngress, Name: ing.Name, Namespace: ing.Namespace,
			}, true
		}},
		{"persistentvolumeclaims", localPVCs, func(obj interface{}) (graph.Node, bool) {
			pvc := obj.(*corev1.PersistentVolumeClaim)
			if ns != "" && pvc.Namespace != ns {
				return graph.Node{}, false
			}
			n := graph.Node{
				Kind: graph.KindPVC, Name: pvc.Name, Namespace: pvc.Namespace,
				Phase: string(pvc.Status.Phase), UID: string(pvc.UID), Labels: pvc.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"nodes", localNodes, func(obj interface{}) (graph.Node, bool) {
			// Cluster-scoped: always included regardless of ns filter.
			node := obj.(*corev1.Node)
			n := graph.Node{
				Kind: graph.KindNode, Name: node.Name, UID: string(node.UID), Labels: node.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
		{"networkpolicies", localNPs, func(obj interface{}) (graph.Node, bool) {
			np := obj.(*networkingv1.NetworkPolicy)
			if ns != "" && np.Namespace != ns {
				return graph.Node{}, false
			}
			n := graph.Node{
				Kind: graph.KindNetworkPolicy, Name: np.Name, Namespace: np.Namespace,
				UID: string(np.UID), Labels: np.Labels,
			}
			n.ID = n.ComputeID()
			return n, true
		}},
	}

	// Pre-size to avoid repeated slice growth; actual count may be less after
	// namespace filtering, but the upper bound eliminates all reallocs.
	totalCapacity := len(localPods) + len(localServices) + len(localDeployments) +
		len(localReplicaSets) + len(localDaemonSets) + len(localStatefulSets) +
		len(localJobs) + len(localCronJobs) + len(localIngresses) +
		len(localPVCs) + len(localNodes) + len(localNPs)
	initialNodes := make([]graph.Node, 0, totalCapacity)
	for _, src := range sources {
		// Skip resource kinds the RBAC probe determined are denied. When
		// allowedResources is nil the probe has not run yet — stay permissive.
		if allowedResources != nil && src.resourceName != "" && !allowedResources[src.resourceName] {
			continue
		}
		for _, obj := range src.cacheMap {
			if n, ok := src.build(obj); ok {
				initialNodes = append(initialNodes, n)
			}
		}
	}

	// Assemble the snapshot cache for discoverers from the already-copied local maps.
	// Workloads are merged in ascending priority order so higher-priority types
	// (Deployments) overwrite lower-priority ones on key collision.
	snap := &snapshotCache{
		pods:            localPods,
		services:        localServices,
		workloads:       make(map[string]interface{}, len(localDeployments)+len(localReplicaSets)+len(localDaemonSets)+len(localStatefulSets)+len(localJobs)+len(localCronJobs)),
		ingresses:       localIngresses,
		pvcs:            localPVCs,
		nodes:           localNodes,
		networkPolicies: localNPs,
	}
	for k, v := range localCronJobs     { snap.workloads[k] = v }
	for k, v := range localJobs         { snap.workloads[k] = v }
	for k, v := range localStatefulSets { snap.workloads[k] = v }
	for k, v := range localDaemonSets   { snap.workloads[k] = v }
	for k, v := range localReplicaSets  { snap.workloads[k] = v }
	for k, v := range localDeployments  { snap.workloads[k] = v }

	// Build a UID-indexed workload map so OwnerDiscoverer can look up the exact
	// object for a given node even when two workload types share a namespace/name.
	snap.workloadsByUID = make(map[string]interface{}, len(snap.workloads))
	for _, m := range []map[string]interface{}{
		localCronJobs, localJobs, localStatefulSets, localDaemonSets, localReplicaSets, localDeployments,
	} {
		for _, obj := range m {
			if meta, ok := obj.(metav1.Object); ok {
				snap.workloadsByUID[string(meta.GetUID())] = obj
			}
		}
	}

	// Sort by ID so map-iteration non-determinism doesn't reorder nodes between
	// requests. A stable order prevents the force-directed layout from jumping
	// when the graph hasn't actually changed.
	sort.Slice(initialNodes, func(i, j int) bool {
		return initialNodes[i].ID < initialNodes[j].ID
	})

	// 2. Build Graph using the new Discovery Engine
	// HubbleDiscoverer is always registered; it lazily connects on first use
	// and returns zero edges when Hubble Relay is absent or unreachable.
	// flowWindow defaults to 60 s; callers may pass ?flowWindow=<seconds> (5–3600).
	flowWindowSecs := 60
	if fw := r.URL.Query().Get("flowWindow"); fw != "" {
		if n, err := strconv.Atoi(fw); err == nil && n >= 5 && n <= 3600 {
			flowWindowSecs = n
		}
	}
	builder := graph.NewGraphBuilder(snap)
	builder.AddDiscoverer(hubble.NewDiscoverer(hubble.DefaultManager, time.Duration(flowWindowSecs)*time.Second, ns))
	g := builder.Build(r.Context(), initialNodes)

	buf, err := json.Marshal(g)
	if err != nil {
		http.Error(w, "failed to serialize topology: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(buf)
}

// sseEvent writes a single SSE event and flushes.
func sseEvent(w http.ResponseWriter, f http.Flusher, eventType, data string) error {
	_, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, data)
	if err != nil {
		return err
	}
	f.Flush()
	return nil
}
