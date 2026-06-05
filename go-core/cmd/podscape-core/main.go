package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/podscape/go-core/internal/client"
	"github.com/podscape/go-core/internal/handlers"
	"github.com/podscape/go-core/internal/hubble"
	"github.com/podscape/go-core/internal/informers"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/store"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/util/homedir"
	klog "k8s.io/klog/v2"
)

type filteredWriter struct {
	w       *os.File
	filters []string
}

func (fw *filteredWriter) Write(p []byte) (int, error) {
	s := string(p)
	for _, f := range fw.filters {
		if strings.Contains(s, f) {
			return len(p), nil
		}
	}
	return fw.w.Write(p)
}

func newFilteredStderr(filters ...string) *filteredWriter {
	return &filteredWriter{w: os.Stderr, filters: filters}
}

func main() {
	// klog v2 defaults logtostderr=true which bypasses SetOutput and writes
	// directly to os.Stderr. Register klog's own flags so we can disable that
	// before flag.Parse(), then redirect through a filter.
	klog.InitFlags(nil)
	rest.SetDefaultWarningHandler(rest.NoWarnings{})

	var kubeconfig *string
	if home := homedir.HomeDir(); home != "" {
		kubeconfig = flag.String("kubeconfig", "", "(optional) absolute path to the kubeconfig file")
	} else {
		kubeconfig = flag.String("kubeconfig", "", "absolute path to the kubeconfig file")
	}
	port := flag.String("port", "5050", "port to listen on")
	token := flag.String("token", "", "shared secret; requests without X-Podscape-Token matching this value are rejected")
	flag.Parse()

	// Now that flags are parsed, turn off klog's direct-stderr path and redirect
	// through a filter that drops bookmark noise. Errors still pass through.
	flag.Set("logtostderr", "false") //nolint:errcheck
	klog.SetOutput(newFilteredStderr(
		"bookmark expired",
		"hasn't received required bookmark event",
		// client-go logs this when a POST body read is cancelled mid-flight by a
		// context timeout (e.g. during the RBAC SAR probe). Not actionable noise.
		"Unexpected error when reading response body",
	))

	store.Store.Kubeconfig = *kubeconfig

	// Register all routes before starting the server.
	http.HandleFunc("/health", handlers.HandleHealth)

	// Standard resources — routes and handlers are generated from AllResourceDefs.
	// To add a new standard resource, add an entry there; no changes needed here.
	for _, rd := range handlers.AllResourceDefs {
		http.HandleFunc("/"+rd.Path(), rd.Handler())
	}

	// Resources with bespoke handler logic registered manually.
	http.HandleFunc("/events", handlers.HandleEvents)
	http.HandleFunc("/crds", handlers.HandleCRDs)
	http.HandleFunc("/helm/list", handlers.HandleHelmList)
	http.HandleFunc("/helm/status", handlers.HandleHelmStatus)
	http.HandleFunc("/helm/values", handlers.HandleHelmValues)
	http.HandleFunc("/helm/history", handlers.HandleHelmHistory)
	http.HandleFunc("/logs", handlers.HandleLogs)
	http.HandleFunc("/portforward", handlers.HandlePortForward)
	http.HandleFunc("/stopPortForward", handlers.HandleStopPortForward)
	http.HandleFunc("/portforward/alive", handlers.HandlePortForwardAlive)

	http.HandleFunc("/scale", handlers.HandleScale)
	http.HandleFunc("/delete", handlers.HandleDelete)
	http.HandleFunc("/rollout/restart", handlers.HandleRolloutRestart)
	http.HandleFunc("/rollout/history", handlers.HandleRolloutHistory)
	http.HandleFunc("/rollout/undo", handlers.HandleRolloutUndo)
	http.HandleFunc("/getYAML", handlers.HandleGetYAML)
	http.HandleFunc("/apply", handlers.HandleApplyYAML)
	http.HandleFunc("/secret/value", handlers.HandleGetSecretValue)
	http.HandleFunc("/exec", handlers.HandleExec)
	http.HandleFunc("/exec/oneshot", handlers.HandleExecOneShot)
	http.HandleFunc("/cp/from", handlers.HandleCPFrom)
	http.HandleFunc("/cp/to", handlers.HandleCPTo)
	http.HandleFunc("/config/contexts", handlers.HandleGetContexts)
	http.HandleFunc("/config/current-context", handlers.HandleGetCurrentContext)
	http.HandleFunc("/config/switch", handlers.HandleSwitchContext)
	http.HandleFunc("/rbac", handlers.HandleGetAllowedVerbs)
	http.HandleFunc("/helm/rollback", handlers.HandleHelmRollback)
	http.HandleFunc("/helm/uninstall", handlers.HandleHelmUninstall)
	http.HandleFunc("/metrics/pods", handlers.HandleGetPodMetrics)
	http.HandleFunc("/metrics/nodes", handlers.HandleGetNodeMetrics)
	http.HandleFunc("/debugpod/create", handlers.HandleCreateDebugPod)
	http.HandleFunc("/topology", handlers.HandleTopology)
	http.HandleFunc("/security/scan", handlers.HandleSecurityScan)
	http.HandleFunc("/security/kubesec", handlers.HandleKubesec)
	http.HandleFunc("/security/kubesec/batch", handlers.HandleKubesecBatch)
	http.HandleFunc("/security/trivy/images", handlers.HandleTrivyImages)

	// Prometheus
	http.HandleFunc("/prometheus/status", handlers.HandlePrometheusStatus)
	http.HandleFunc("/prometheus/query_range_batch", handlers.HandlePrometheusQueryBatch)
	http.HandleFunc("/prometheus/cache/clear", handlers.HandlePrometheusClearCache)

	// Owner chain
	http.HandleFunc("/owner-chain", handlers.HandleOwnerChain)

	// Helm repo browser
	http.HandleFunc("/helm/repos", handlers.HandleHelmRepoList)
	http.HandleFunc("/helm/repos/add", handlers.HandleHelmRepoAdd)
	http.HandleFunc("/helm/repos/search", handlers.HandleHelmRepoSearch)
	http.HandleFunc("/helm/repos/versions", handlers.HandleHelmRepoVersions)
	http.HandleFunc("/helm/repos/values", handlers.HandleHelmRepoValues)
	http.HandleFunc("/helm/repos/refresh", handlers.HandleHelmRepoRefresh)
	http.HandleFunc("/helm/repos/latest", handlers.HandleHelmRepoLatest)
	http.HandleFunc("/helm/install", handlers.HandleHelmInstall)

	// Node operations
	http.HandleFunc("/node/cordon", handlers.HandleCordonNode)
	http.HandleFunc("/node/drain", handlers.HandleDrainNode)

	// CronJob operations
	http.HandleFunc("/cronjob/trigger", handlers.HandleTriggerCronJob)

	// TLS Certificate Dashboard
	http.HandleFunc("/tls-certs", handlers.HandleTLSCerts)

	// GitOps Panel
	http.HandleFunc("/gitops", handlers.HandleGitOps)
	http.HandleFunc("/gitops/reconcile", handlers.HandleGitOpsReconcile)
	http.HandleFunc("/gitops/suspend", handlers.HandleGitOpsSuspend)

	// Provider detection (Istio, Traefik, Nginx)
	http.HandleFunc("/providers", handlers.HandleProviders)

	// Generic CRD resource lister (Istio, Traefik, Nginx, etc.)
	http.HandleFunc("/customresource", handlers.HandleCustomResource)

	// Build the middleware chain: mux → [token auth]
	// CORS headers are intentionally omitted — the sidecar binds to 127.0.0.1
	// and is only accessed by the Electron renderer (file:// / localhost origin).
	// A wildcard CORS header would allow any webpage the user visits to send
	// requests to the sidecar, defeating the token-auth layer.
	var handler http.Handler = http.DefaultServeMux
	if *token != "" {
		tok := *token
		inner := handler
		handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// /health is exempt — sidecar.ts polls it without an auth header
			// during startup before it knows the token.
			if r.URL.Path != "/health" && r.Header.Get("X-Podscape-Token") != tok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			inner.ServeHTTP(w, r)
		})
	}

	// Initialize the portforward manager early (with nil clients) so handlers
	// like HandleSwitchContext can safely call Manager.StopAll() immediately.
	portforward.Init(nil, nil)
	hubble.Init(nil, nil)

	// Build the k8s client; fail gracefully into setup mode if no valid kubeconfig exists.
	// If the file is missing (fresh install, CI, new machine), run in no-kubeconfig
	// mode: start the server immediately so /health returns 200, and let the
	// renderer show the KubeConfigOnboarding screen instead of crashing.
	bundle, err := client.Init(*kubeconfig)
	if err != nil {
		log.Printf("[sidecar] no valid kubeconfig at %q (%v) — running in setup mode", *kubeconfig, err)
		store.Store.Lock()
		store.Store.NoKubeconfig = true
		store.Store.Unlock()
		setupErr := make(chan error, 1)
		go func() {
			fmt.Printf("Go sidecar listening on port %s\n", *port)
			if err := http.ListenAndServe("127.0.0.1:"+*port, handler); err != nil {
				setupErr <- err
			}
		}()
		fmt.Printf("Go sidecar ready on port %s (no kubeconfig — onboarding mode)\n", *port)
		select {
		case err := <-setupErr:
			log.Fatalf("HTTP server error: %v", err)
		}
	}

	// Bootstrap the initial context cache and set it as active.
	initialCache, _ := store.Store.GetOrCreateCache(bundle.ContextName, bundle.Clientset, bundle.Config)
	initialCache.Lock()
	initialCache.ApiextensionsClientset = bundle.ApiextClient
	initialCache.Unlock()
	store.Store.Lock()
	store.Store.ActiveContextName = bundle.ContextName
	store.Store.ActiveCache = initialCache
	store.Store.Unlock()

	// Update the portforward manager with valid clients now that we have them.
	portforward.Manager.UpdateClients(bundle.Clientset, bundle.Config)
	hubble.Init(bundle.Clientset, bundle.Config)
	hubble.DefaultManager.WarmUp()

	// Start the HTTP server — /health returns 503 until informers sync, so
	// startSidecar() keeps polling. portforward is already initialised above.
	serverErr := make(chan error, 1)
	go func() {
		fmt.Printf("Go sidecar listening on port %s\n", *port)
		if err := http.ListenAndServe("127.0.0.1:"+*port, handler); err != nil {
			serverErr <- err
		}
	}()

	// Run the full RBAC probe (all 6 verbs) concurrently with informer startup
	// so a slow or temporarily-unreachable API server does not delay the sidecar
	// becoming ready. This sets both AllowedResources (controls which informers
	// start) and AllowedVerbs (controls which action buttons are shown in the UI).
	// Starting informers with nil AllowedResources is the permissive default —
	// all informers start. MakeHandler enforces RBAC on every request regardless
	// of whether the probe ran before or after informers started.
	go handlers.RunRBACProbe(initialCache.CacheCtx, initialCache, bundle.ContextName, bundle.Clientset)

	// Block until the critical informers are synced, then mark the sidecar ready.
	// /health returns 503 until this completes, so startSidecar() keeps polling.
	informers.InitInformers(initialCache, initialCache.StopCh)

	initialCache.Lock()
	initialCache.CacheReady = true
	initialCache.HasData = true
	initialCache.Unlock()

	fmt.Printf("Go sidecar ready on port %s (kubeconfig: %s)\n", *port, bundle.Kubeconfig)

	// Block the main goroutine — process lifetime is managed by Electron (SIGTERM).
	// If the HTTP server fails to bind (e.g. port already in use), surface the
	// error via log.Fatal rather than silently calling os.Exit(1) from a goroutine.
	select {
	case err := <-serverErr:
		log.Fatalf("HTTP server error: %v", err)
	}
}
