package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"context"
	"time"

	"github.com/podscape/go-core/internal/client"
	"github.com/podscape/go-core/internal/handlers"
	"github.com/podscape/go-core/internal/informers"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/rbac"
	"github.com/podscape/go-core/internal/store"
	"k8s.io/client-go/util/homedir"

)

func main() {
	var kubeconfig *string
	if home := homedir.HomeDir(); home != "" {
		kubeconfig = flag.String("kubeconfig", "", "(optional) absolute path to the kubeconfig file")
	} else {
		kubeconfig = flag.String("kubeconfig", "", "absolute path to the kubeconfig file")
	}
	port := flag.String("port", "5050", "port to listen on")
	token := flag.String("token", "", "shared secret; requests without X-Podscape-Token matching this value are rejected")
	flag.Parse()

	store.Store.Kubeconfig = *kubeconfig

	// Register all routes before starting the server.
	http.HandleFunc("/health", handlers.HandleHealth)
	http.HandleFunc("/nodes", handlers.HandleNodes)
	http.HandleFunc("/namespaces", handlers.HandleNamespaces)
	http.HandleFunc("/pods", handlers.HandlePods)
	http.HandleFunc("/deployments", handlers.HandleDeployments)
	http.HandleFunc("/daemonsets", handlers.HandleDaemonSets)
	http.HandleFunc("/statefulsets", handlers.HandleStatefulSets)
	http.HandleFunc("/replicasets", handlers.HandleReplicaSets)
	http.HandleFunc("/jobs", handlers.HandleJobs)
	http.HandleFunc("/cronjobs", handlers.HandleCronJobs)
	http.HandleFunc("/hpas", handlers.HandleHPAs)
	http.HandleFunc("/pdbs", handlers.HandlePDBs)

	http.HandleFunc("/services", handlers.HandleServices)
	http.HandleFunc("/ingresses", handlers.HandleIngresses)
	http.HandleFunc("/ingressclasses", handlers.HandleIngressClasses)
	http.HandleFunc("/networkpolicies", handlers.HandleNetworkPolicies)
	http.HandleFunc("/endpoints", handlers.HandleEndpoints)

	http.HandleFunc("/configmaps", handlers.HandleConfigMaps)
	http.HandleFunc("/secrets", handlers.HandleSecrets)
	http.HandleFunc("/pvcs", handlers.HandlePVCs)
	http.HandleFunc("/pvs", handlers.HandlePVs)
	http.HandleFunc("/storageclasses", handlers.HandleStorageClasses)

	http.HandleFunc("/serviceaccounts", handlers.HandleServiceAccounts)
	http.HandleFunc("/roles", handlers.HandleRoles)
	http.HandleFunc("/clusterroles", handlers.HandleClusterRoles)
	http.HandleFunc("/rolebindings", handlers.HandleRoleBindings)
	http.HandleFunc("/clusterrolebindings", handlers.HandleClusterRoleBindings)
	http.HandleFunc("/crds", handlers.HandleCRDs)
	http.HandleFunc("/events", handlers.HandleEvents)
	http.HandleFunc("/helm/list", handlers.HandleHelmList)
	http.HandleFunc("/helm/status", handlers.HandleHelmStatus)
	http.HandleFunc("/helm/values", handlers.HandleHelmValues)
	http.HandleFunc("/helm/history", handlers.HandleHelmHistory)
	http.HandleFunc("/logs", handlers.HandleLogs)
	http.HandleFunc("/portforward", handlers.HandlePortForward)
	http.HandleFunc("/stopPortForward", handlers.HandleStopPortForward)

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

	// Cost allocation (Kubecost or OpenCost — detects whichever is deployed)
	http.HandleFunc("/cost/status", handlers.HandleCostStatus)
	http.HandleFunc("/cost/allocation", handlers.HandleCostAllocation)

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
		go func() {
			fmt.Printf("Go sidecar listening on port %s\n", *port)
			log.Fatal(http.ListenAndServe("127.0.0.1:"+*port, handler))
		}()
		fmt.Printf("Go sidecar ready on port %s (no kubeconfig — onboarding mode)\n", *port)
		select {} // block until Electron kills the process
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

	// Start the HTTP server — /health returns 503 until informers sync, so
	// startSidecar() keeps polling. portforward is already initialised above.
	go func() {
		fmt.Printf("Go sidecar listening on port %s\n", *port)
		log.Fatal(http.ListenAndServe("127.0.0.1:"+*port, handler))
	}()

	// Probe RBAC permissions before starting informers so the informer guards
	// can skip resources the current user cannot access. A 10-second deadline
	// prevents a slow API server from delaying startup significantly.
	{
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		allowed, err := rbac.CheckAccessFunc(ctx, bundle.Clientset)
		cancel()
		if err != nil {
			log.Printf("[main] RBAC probe failed, starting all informers: %v", err)
		} else {
			denied := 0
			for _, ok := range allowed {
				if !ok {
					denied++
				}
			}
			log.Printf("[main] RBAC probe complete: %d/%d resources accessible", len(allowed)-denied, len(allowed))
			initialCache.Lock()
			initialCache.AllowedResources = allowed
			initialCache.Unlock()
		}
	}

	// Block until the critical informers are synced, then mark the sidecar ready.
	// /health returns 503 until this completes, so startSidecar() keeps polling.
	informers.InitInformers(initialCache, initialCache.StopCh)

	initialCache.Lock()
	initialCache.CacheReady = true
	initialCache.HasData = true
	initialCache.Unlock()

	fmt.Printf("Go sidecar ready on port %s (kubeconfig: %s)\n", *port, bundle.Kubeconfig)

	// Block the main goroutine — process lifetime is managed by Electron (SIGTERM).
	select {}
}
