package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/informers"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/prometheus"
	"github.com/podscape/go-core/internal/rbac"
	"github.com/podscape/go-core/internal/store"
	apiextensionsclientset "k8s.io/apiextensions-apiserver/pkg/client/clientset/clientset"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

// syncInformersFunc is the function used to warm the informer cache after a
// context switch. It is a variable so tests can substitute a no-op without
// needing a live Kubernetes cluster.
var syncInformersFunc = informers.SyncInformers

// rbacCheckFunc is the function used to probe RBAC permissions before starting
// informers. It is a variable so tests can substitute a stub.
var rbacCheckFunc = rbac.CheckAccess

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// kindGVR maps the lowercase kind name used in API query params to its
// Kubernetes GroupVersionResource. Used by HandleDelete and HandleGetYAML
// to avoid duplicating a 25-case switch.
var kindGVR = map[string]schema.GroupVersionResource{
	"pod":                     {Group: "", Version: "v1", Resource: "pods"},
	"deployment":              {Group: "apps", Version: "v1", Resource: "deployments"},
	"service":                 {Group: "", Version: "v1", Resource: "services"},
	"configmap":               {Group: "", Version: "v1", Resource: "configmaps"},
	"secret":                  {Group: "", Version: "v1", Resource: "secrets"},
	"ingress":                 {Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"},
	"statefulset":             {Group: "apps", Version: "v1", Resource: "statefulsets"},
	"daemonset":               {Group: "apps", Version: "v1", Resource: "daemonsets"},
	"replicaset":              {Group: "apps", Version: "v1", Resource: "replicasets"},
	"job":                     {Group: "batch", Version: "v1", Resource: "jobs"},
	"cronjob":                 {Group: "batch", Version: "v1", Resource: "cronjobs"},
	"horizontalpodautoscaler": {Group: "autoscaling", Version: "v1", Resource: "horizontalpodautoscalers"},
	"poddisruptionbudget":     {Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"},
	"ingressclass":            {Group: "networking.k8s.io", Version: "v1", Resource: "ingressclasses"},
	"networkpolicy":           {Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"},
	"endpoints":               {Group: "", Version: "v1", Resource: "endpoints"},
	"pvc":                     {Group: "", Version: "v1", Resource: "persistentvolumeclaims"},
	"pv":                      {Group: "", Version: "v1", Resource: "persistentvolumes"},
	"storageclass":            {Group: "storage.k8s.io", Version: "v1", Resource: "storageclasses"},
	"serviceaccount":          {Group: "", Version: "v1", Resource: "serviceaccounts"},
	"role":                    {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"},
	"clusterrole":             {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"},
	"rolebinding":             {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"},
	"clusterrolebinding":      {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"},
	"node":                    {Group: "", Version: "v1", Resource: "nodes"},
	"namespace":               {Group: "", Version: "v1", Resource: "namespaces"},
	"crd":                     {Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"},
	// Aliases — renderer components use both short and full names
	"hpa":                   {Group: "autoscaling", Version: "v1", Resource: "horizontalpodautoscalers"},
	"persistentvolumeclaim": {Group: "", Version: "v1", Resource: "persistentvolumeclaims"},
	"persistentvolume":      {Group: "", Version: "v1", Resource: "persistentvolumes"},
}

// clusterScopedKinds are not namespace-scoped; calls must omit the namespace.
var clusterScopedKinds = map[string]bool{
	"pv": true, "persistentvolume": true, "storageclass": true, "ingressclass": true,
	"clusterrole": true, "clusterrolebinding": true,
	"node": true, "namespace": true, "crd": true,
}

// listToIface converts a typed k8s list items slice into []interface{} for JSON
// encoding. Used by the direct-API fallback functions in MakeHandler.
func listToIface[T any](items []T) []interface{} {
	result := make([]interface{}, len(items))
	for i := range items {
		result[i] = &items[i]
	}
	return result
}

// MakeHandler creates an HTTP handler that serves resources from the per-context
// informer cache. An optional listFn provides a direct k8s API fallback used
// when HasData is false, giving kubectl-like cold-start speed while informers
// warm up in the background.
//
// resource is the lowercase plural name used to look up RBAC permission in the
// cache (e.g. "pods", "deployments"). When the RBAC probe has run and this
// resource is denied, the handler returns 200 with an empty JSON array and the
// X-Podscape-Denied: true response header so the UI can show a "no permission"
// state instead of an empty list.
func MakeHandler(
	resource string,
	mapFn func(c *store.ContextCache) map[string]interface{},
	listFn ...func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error),
) http.HandlerFunc {
	var fallback func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error)
	if len(listFn) > 0 {
		fallback = listFn[0]
	}
	return func(w http.ResponseWriter, r *http.Request) {
		ns := r.URL.Query().Get("namespace")

		store.Store.RLock()
		ac := store.Store.ActiveCache
		store.Store.RUnlock()

		if ac == nil {
			http.Error(w, "no active context", http.StatusServiceUnavailable)
			return
		}

		// RBAC guard: if the probe ran and explicitly denied this resource,
		// return an empty list rather than attempting a cache read or live call.
		ac.RLock()
		allowedResources := ac.AllowedResources
		ac.RUnlock()
		if allowedResources != nil && !allowedResources[resource] {
			w.Header().Set("X-Podscape-Denied", "true")
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("[]"))
			return
		}

		// Cold path: direct API call when the informer cache has never been populated.
		if fallback != nil {
			ac.RLock()
			hasData := ac.HasData
			cs := ac.Clientset
			ac.RUnlock()
			if !hasData && cs != nil {
				items, err := fallback(r.Context(), cs, ns)
				if err == nil {
					w.Header().Set("Content-Type", "application/json")
					json.NewEncoder(w).Encode(items)
					return
				}
				log.Printf("[Handler] direct fallback failed, serving cache: %v", err)
			}
		}

		// Hot path: serve from informer cache.
		ac.RLock()
		data := mapFn(ac)
		snapshot := make([]interface{}, 0, len(data))
		for _, v := range data {
			snapshot = append(snapshot, v)
		}
		ac.RUnlock()

		// Filter outside the lock.
		items := snapshot
		if ns != "" {
			items = snapshot[:0]
			for _, v := range snapshot {
				if obj, ok := v.(metav1.Object); ok {
					if obj.GetNamespace() != "" && obj.GetNamespace() != ns {
						continue
					}
				} else if m, ok := v.(map[string]interface{}); ok {
					if meta, ok := m["metadata"].(map[string]interface{}); ok {
						if mns, ok := meta["namespace"].(string); ok && mns != "" && mns != ns {
							continue
						}
					}
				}
				items = append(items, v)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	}
}

func HandleHealth(w http.ResponseWriter, r *http.Request) {
	store.Store.RLock()
	ac := store.Store.ActiveCache
	noKubeconfig := store.Store.NoKubeconfig
	store.Store.RUnlock()

	// No kubeconfig on disk — sidecar is up but in onboarding mode.
	// Return 200 so startSidecar() resolves and the renderer can show
	// KubeConfigOnboarding instead of the "sidecar failed" error dialog.
	if noKubeconfig {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
		return
	}

	var ready bool
	if ac != nil {
		ac.RLock()
		ready = ac.CacheReady
		ac.RUnlock()
	}

	if ready {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("starting"))
	}
}

func HandleGetContexts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	config, err := clientcmd.LoadFromFile(store.Store.Kubeconfig)
	if err != nil {
		// Kubeconfig missing or unreadable — return empty list so the renderer
		// shows KubeConfigOnboarding rather than an unhandled error.
		json.NewEncoder(w).Encode(map[string]interface{}{})
		return
	}
	json.NewEncoder(w).Encode(config.Contexts)
}

func HandleGetCurrentContext(w http.ResponseWriter, r *http.Request) {
	store.Store.RLock()
	ctxName := store.Store.ActiveContextName
	store.Store.RUnlock()

	if ctxName == "" {
		// Fallback to kubeconfig if not set in store yet
		config, err := clientcmd.LoadFromFile(store.Store.Kubeconfig)
		if err == nil {
			ctxName = config.CurrentContext
		}
	}

	w.Write([]byte(ctxName))
}

// runRBACProbe probes access permissions for the given context and stores the
// result in the cache. It runs under a 10-second deadline so a slow API server
// cannot delay informer startup by more than that. On failure, AllowedResources
// is left nil (permissive: all informers start).
func runRBACProbe(cache *store.ContextCache, ctxName string, cs kubernetes.Interface) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	allowed, err := rbacCheckFunc(ctx, cs)
	if err != nil {
		log.Printf("[SwitchContext] RBAC probe failed for %q, proceeding without restriction: %v", ctxName, err)
		return
	}
	cache.Lock()
	cache.AllowedResources = allowed
	cache.Unlock()

	denied := 0
	for _, ok := range allowed {
		if !ok {
			denied++
		}
	}
	log.Printf("[SwitchContext] RBAC probe complete for %q: %d/%d resources accessible",
		ctxName, len(allowed)-denied, len(allowed))
}

func HandleSwitchContext(w http.ResponseWriter, r *http.Request) {
	contextName := r.URL.Query().Get("context")
	if contextName == "" {
		http.Error(w, "missing context parameter", http.StatusBadRequest)
		return
	}

	// 1. Load kubeconfig and validate the context exists (in-app switch only — never writes to disk).
	kubeconfigFile, err := clientcmd.LoadFromFile(store.Store.Kubeconfig)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if _, ok := kubeconfigFile.Contexts[contextName]; !ok {
		http.Error(w, "context not found", http.StatusNotFound)
		return
	}

	// 2. Build a new REST config and clientset for the target context.
	clientConfig := clientcmd.NewNonInteractiveClientConfig(
		*kubeconfigFile, contextName, &clientcmd.ConfigOverrides{}, nil,
	)
	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		http.Error(w, "failed to build REST config for context: "+err.Error(), http.StatusInternalServerError)
		return
	}
	restConfig.QPS = 50
	restConfig.Burst = 100
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		http.Error(w, "failed to create clientset: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Get or create the cache for this context.
	newCache, isNew := store.Store.GetOrCreateCache(contextName, clientset, restConfig)
	if apiextClient, err := apiextensionsclientset.NewForConfig(restConfig); err == nil {
		newCache.Lock()
		newCache.ApiextensionsClientset = apiextClient
		newCache.Unlock()
	}

	// 4. Snapshot old active cache and stop its informers.
	store.Store.RLock()
	oldCache := store.Store.ActiveCache
	store.Store.RUnlock()

	if oldCache != nil && oldCache != newCache {
		oldCache.Lock()
		if oldCache.StopCh != nil {
			close(oldCache.StopCh)
			oldCache.StopCh = nil
		}
		oldCache.Unlock()
	}

	// NOTE: No blocking connectivity check here. Switching context is always
	// committed immediately (same behaviour as kubectl config use-context).
	// If the target cluster is temporarily unreachable (e.g. VPN settling,
	// AWS token refresh, DNS flux), the informers will retry automatically and
	// the UI will surface errors through normal resource-load failures rather
	// than rejecting the switch and leaving the user stuck on the old — possibly
	// equally unreachable — context.

	// 5. Commit the switch.
	store.Store.Lock()
	store.Store.ActiveContextName = contextName
	store.Store.ActiveCache = newCache
	store.Store.Unlock()

	// 6a. If we have cached data for this context, instant switch.
	newCache.RLock()
	hasData := newCache.HasData
	newCache.RUnlock()

	// Stop all port-forwards from the previous context — their local port
	// bindings (e.g. 127.0.0.1:9090) would otherwise keep responding and cause
	// the Prometheus probe to return "Connected" for the wrong cluster.
	portforward.Manager.StopAll()
	portforward.Manager.UpdateClients(clientset, restConfig)
	// Clear the Prometheus query cache so cluster A results are never served
	// to cluster B even if the PromQL strings and time range happen to match.
	prometheus.ClearCache()

	if !isNew && hasData {
		// Known context: serve stale cache immediately, refresh in background.
		log.Printf("[SwitchContext] instant switch to %q (cached) — refreshing informers in background", contextName)
		go func() {
			runRBACProbe(newCache, contextName, clientset)
			informers.RestartInformers(newCache)
			newCache.Lock()
			newCache.CacheReady = true
			newCache.Unlock()
			log.Printf("[SwitchContext] informer refresh complete for %q", contextName)
		}()
	} else {
		// 6b. New context or cache has no data yet: warm informers in background.
		newStopCh := make(chan struct{})
		newCache.Lock()
		newCache.StopCh = newStopCh
		newCache.Unlock()
		go func() {
			runRBACProbe(newCache, contextName, clientset)
			syncInformersFunc(newCache, newStopCh, 60*time.Second)
			newCache.Lock()
			newCache.CacheReady = true
			newCache.Unlock()
			log.Printf("[SwitchContext] cache sync complete for %q", contextName)
		}()
	}

	log.Printf("[SwitchContext] switched to %q", contextName)
	w.WriteHeader(http.StatusOK)
}

// wsStream wraps a WebSocket connection to implement io.ReadWriter.
type wsStream struct {
	conn *websocket.Conn
	buf  bytes.Buffer
}

func (s *wsStream) Read(p []byte) (n int, err error) {
	if s.buf.Len() == 0 {
		_, msg, err := s.conn.ReadMessage()
		if err != nil {
			return 0, err
		}
		s.buf.Write(msg)
	}
	return s.buf.Read(p)
}

func (s *wsStream) Write(p []byte) (n int, err error) {
	err = s.conn.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

// captureWriter is an io.Writer that captures output into a byte slice.
type captureWriter struct {
	data []byte
}

func (w *captureWriter) Write(p []byte) (n int, err error) {
	w.data = append(w.data, p...)
	return len(p), nil
}

func (w *captureWriter) String() string {
	return string(w.data)
}
