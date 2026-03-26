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

	"github.com/gorilla/websocket"
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

func HandleTopology(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")

	store.Store.RLock()
	ac := store.Store.ActiveCache
	store.Store.RUnlock()

	if ac == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	topoCache.Lock()
	entry, ok := topoCache.entries[ns]
	if ok && time.Since(entry.builtAt) < topoCacheTTL {
		topo := entry.topo
		topoCache.Unlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(topo)
		return
	}
	topoCache.Unlock()

	topo := topology.BuildTopology(ns, ac)

	topoCache.Lock()
	topoCache.entries[ns] = topoCacheEntry{topo: topo, builtAt: time.Now()}
	topoCache.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(topo)
}

// sseEvent writes a single SSE event and flushes.
func sseEvent(w http.ResponseWriter, f http.Flusher, eventType, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, data)
	f.Flush()
}
