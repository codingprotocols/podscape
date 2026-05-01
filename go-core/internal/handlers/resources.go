package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/podscape/go-core/internal/store"
)

// handleEventsAll is the standard MakeHandler-generated handler for the events
// section (returns all events in a namespace). HandleEvents delegates to it
// when no involvedObject filter is requested.
var handleEventsAll = MakeHandler("events",
	func(c *store.ContextCache) map[string]interface{} { return c.Events },
	func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
		list, err := cs.CoreV1().Events(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}
		return listToIface(list.Items), nil
	})

// HandleEvents serves events from the informer cache. When the "uid" query
// parameter is present it filters by involvedObject.UID — a single O(1)-style
// string comparison against the globally-unique resource UID. The cache is
// capped at 1000 events so the scan is bounded and fast.
// Without uid it delegates to handleEventsAll (the events section view).
func HandleEvents(w http.ResponseWriter, r *http.Request) {
	uid := r.URL.Query().Get("uid")

	// No involvedObject filter — use the standard section handler.
	if uid == "" {
		handleEventsAll(w, r)
		return
	}

	store.Store.RLock()
	ac := store.Store.ActiveCache
	store.Store.RUnlock()

	if ac == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// RBAC guard — same semantics as MakeHandler.
	ac.RLock()
	allowedResources := ac.AllowedResources
	ac.RUnlock()
	if allowedResources != nil && !allowedResources["events"] {
		w.Header().Set("X-Podscape-Denied", "true")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
		return
	}

	// Snapshot the events map under a read-lock.
	ac.RLock()
	data := ac.Events
	snapshot := make([]interface{}, 0, len(data))
	for _, v := range data {
		snapshot = append(snapshot, v)
	}
	ac.RUnlock()

	// Filter outside the lock by involvedObject.UID (globally unique).
	filtered := make([]interface{}, 0)
	for _, v := range snapshot {
		ev, ok := v.(*corev1.Event)
		if !ok {
			continue
		}
		if string(ev.InvolvedObject.UID) == uid {
			filtered = append(filtered, v)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(filtered)
}

// HandleCRDs serves CRDs from the informer cache, falling back to a direct
// apiextensions API call whenever the cache is empty. The CRD informer uses a
// separate factory (apiextinformers) and may finish syncing after HasData is
// already true, so we cannot rely on HasData alone to gate the fallback.
func HandleCRDs(w http.ResponseWriter, r *http.Request) {
	store.Store.RLock()
	ac := store.Store.ActiveCache
	store.Store.RUnlock()

	if ac == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// RBAC guard — same semantics as MakeHandler.
	ac.RLock()
	allowedResources := ac.AllowedResources
	ac.RUnlock()
	if allowedResources != nil && !allowedResources["customresourcedefinitions"] {
		w.Header().Set("X-Podscape-Denied", "true")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
		return
	}

	// Snapshot the cache and the apiextensions client under one lock.
	ac.RLock()
	apiextClient := ac.ApiextensionsClientset
	data := ac.CRDs
	snapshot := make([]interface{}, 0, len(data))
	for _, v := range data {
		snapshot = append(snapshot, v)
	}
	ac.RUnlock()

	// If the cache is empty and we have the apiextensions client, do a direct
	// API call. This covers both cold start and the gap between HasData=true
	// and the CRD informer completing its first LIST/WATCH sync.
	if len(snapshot) == 0 && apiextClient != nil {
		list, err := apiextClient.ApiextensionsV1().CustomResourceDefinitions().List(r.Context(), metav1.ListOptions{})
		if err == nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(listToIface(list.Items))
			return
		}
		log.Printf("[Handler] CRD direct fallback failed, serving cache: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snapshot)
}

func HandleGetPodMetrics(w http.ResponseWriter, r *http.Request) {
	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}
	concreteCS, ok := cs.(*kubernetes.Clientset)
	if !ok {
		http.Error(w, "metrics unavailable", http.StatusServiceUnavailable)
		return
	}
	ns := r.URL.Query().Get("namespace")
	path := "/apis/metrics.k8s.io/v1beta1/pods"
	if ns != "" {
		path = "/apis/metrics.k8s.io/v1beta1/namespaces/" + ns + "/pods"
	}
	data, err := concreteCS.RESTClient().Get().AbsPath(path).DoRaw(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func HandleGetNodeMetrics(w http.ResponseWriter, r *http.Request) {
	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}
	concreteCS, ok := cs.(*kubernetes.Clientset)
	if !ok {
		http.Error(w, "metrics unavailable", http.StatusServiceUnavailable)
		return
	}
	data, err := concreteCS.RESTClient().Get().AbsPath("/apis/metrics.k8s.io/v1beta1/nodes").DoRaw(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}
