package handlers

import (
	"bufio"
	"bytes"
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net/http"
	osexec "os/exec"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/exec"
	"github.com/podscape/go-core/internal/helm"
	"github.com/podscape/go-core/internal/informers"
	"github.com/podscape/go-core/internal/logs"
	"github.com/podscape/go-core/internal/ownerchain"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/prometheus"
	"github.com/podscape/go-core/internal/store"
	"github.com/podscape/go-core/internal/topology"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/retry"
	"github.com/controlplaneio/kubesec/v2/pkg/ruler"
	"go.uber.org/zap"
	"sigs.k8s.io/yaml"
)

// syncInformersFunc is the function used to warm the informer cache after a
// context switch. It is a variable so tests can substitute a no-op without
// needing a live Kubernetes cluster.
var syncInformersFunc = informers.SyncInformers

// connectivityCheckFunc verifies that the target cluster API server is
// reachable before committing to the context switch.  Extracted as a variable
// so tests can inject a stub without needing a real server.
var connectivityCheckFunc = func(cs kubernetes.Interface, ctx context.Context) error {
	_, err := cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{Limit: 1})
	return err
}

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
	"hpa":                     {Group: "autoscaling", Version: "v1", Resource: "horizontalpodautoscalers"},
	"persistentvolumeclaim":   {Group: "", Version: "v1", Resource: "persistentvolumeclaims"},
	"persistentvolume":        {Group: "", Version: "v1", Resource: "persistentvolumes"},
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
func MakeHandler(
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

// Specific handlers for common resources.
// Each handler registers a direct k8s API fallback used when the informer
// cache is cold (HasData=false), providing kubectl-like cold-start speed.
// CRDs are omitted from the fallback — they require the apiextensions client
// which is not stored in the ContextCache Clientset.
var (
	HandleNodes = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Nodes },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePods = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Pods },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleDeployments = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Deployments },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Workloads
	HandleDaemonSets = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.DaemonSets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleStatefulSets = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.StatefulSets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleReplicaSets = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.ReplicaSets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleJobs = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Jobs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleCronJobs = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.CronJobs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.BatchV1().CronJobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleHPAs = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.HPAs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AutoscalingV1().HorizontalPodAutoscalers(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePDBs = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.PDBs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.PolicyV1().PodDisruptionBudgets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Networking
	HandleServices = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Services },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleIngresses = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Ingresses },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleIngressClasses = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.IngressClasses },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().IngressClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleNetworkPolicies = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.NetworkPolicies },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().NetworkPolicies(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleEndpoints = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Endpoints },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Endpoints(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Config & Storage
	HandleConfigMaps = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.ConfigMaps },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().ConfigMaps(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleSecrets = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Secrets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePVCs = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.PVCs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().PersistentVolumeClaims(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePVs = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.PVs },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleStorageClasses = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.StorageClasses },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Cluster & RBAC
	HandleNamespaces = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Namespaces },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleCRDs             = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.CRDs })
	HandleServiceAccounts = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.ServiceAccounts },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().ServiceAccounts(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleRoles = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Roles },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.RbacV1().Roles(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleClusterRoles = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.ClusterRoles },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleRoleBindings = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.RoleBindings },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleClusterRoleBindings = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.ClusterRoleBindings },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleEvents = MakeHandler(func(c *store.ContextCache) map[string]interface{} { return c.Events },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Events(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
)

func HandleHelmList(w http.ResponseWriter, r *http.Request) {
	kubeconfig := r.URL.Query().Get("kubeconfig")
	context := r.URL.Query().Get("context")
	namespace := r.URL.Query().Get("namespace")

	releases, err := helm.ListReleases(kubeconfig, context, namespace)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(releases)
}

func HandleHelmStatus(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	status, err := helm.GetReleaseStatus(kubeconfig, context, namespace, release)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(status))
}

func HandleHelmValues(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")
	all := r.URL.Query().Get("all") == "true"

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	values, err := helm.GetReleaseValues(kubeconfig, context, namespace, release, all)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/yaml")
	w.Write([]byte(values))
}

func HandleHelmHistory(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	history, err := helm.GetReleaseHistory(kubeconfig, context, namespace, release)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

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

	stream, err := logs.StreamLogs(cs, r.Context(), namespace, pod, container, tail, true)
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

func HandleScale(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind") // deployment, statefulset
	name := r.URL.Query().Get("name")
	replicasStr := r.URL.Query().Get("replicas")
	replicas, err := strconv.Atoi(replicasStr)
	if err != nil || replicasStr == "" || replicas < 0 {
		http.Error(w, "invalid replicas: must be a non-negative integer", http.StatusBadRequest)
		return
	}

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	err = retry.RetryOnConflict(retry.DefaultRetry, func() error {
		switch kind {
		case "deployment":
			deploy, err := cs.AppsV1().Deployments(namespace).Get(r.Context(), name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			rep := int32(replicas)
			deploy.Spec.Replicas = &rep
			_, err = cs.AppsV1().Deployments(namespace).Update(r.Context(), deploy, metav1.UpdateOptions{})
			return err
		case "statefulset":
			sts, err := cs.AppsV1().StatefulSets(namespace).Get(r.Context(), name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			rep := int32(replicas)
			sts.Spec.Replicas = &rep
			_, err = cs.AppsV1().StatefulSets(namespace).Update(r.Context(), sts, metav1.UpdateOptions{})
			return err
		default:
			return fmt.Errorf("unsupported kind for scale: %s", kind)
		}
	})

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleDelete(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	gvr, ok := kindGVR[kind]
	if !ok {
		http.Error(w, fmt.Sprintf("unsupported kind: %s", kind), http.StatusBadRequest)
		return
	}

	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if clusterScopedKinds[kind] {
		err = dynClient.Resource(gvr).Delete(r.Context(), name, metav1.DeleteOptions{})
	} else {
		err = dynClient.Resource(gvr).Namespace(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	}

	if err != nil {
		if errors.IsNotFound(err) {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleRolloutRestart(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	data := fmt.Sprintf(`{"spec": {"template": {"metadata": {"annotations": {"kubectl.kubernetes.io/restartedAt": "%s"}}}}}`, time.Now().Format(time.RFC3339))
	var err error
	switch kind {
	case "deployment":
		_, err = cs.AppsV1().Deployments(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	case "daemonset":
		_, err = cs.AppsV1().DaemonSets(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	case "statefulset":
		_, err = cs.AppsV1().StatefulSets(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	default:
		err = fmt.Errorf("unsupported kind for rollout restart: %s", kind)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleGetYAML(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	gvr, ok := kindGVR[kind]
	if !ok {
		http.Error(w, fmt.Sprintf("unsupported kind: %s", kind), http.StatusBadRequest)
		return
	}

	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var obj *unstructured.Unstructured
	if clusterScopedKinds[kind] {
		obj, err = dynClient.Resource(gvr).Get(r.Context(), name, metav1.GetOptions{})
	} else {
		obj, err = dynClient.Resource(gvr).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	y, err := yaml.Marshal(obj.Object)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/yaml")
	w.Write(y)
}

func HandleApplyYAML(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10 MB limit
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "request body too large or unreadable", http.StatusRequestEntityTooLarge)
		return
	}

	// 1. Decode YAML to Unstructured
	obj := &unstructured.Unstructured{}
	if err := yaml.Unmarshal(body, obj); err != nil {
		http.Error(w, "Invalid YAML: "+err.Error(), http.StatusBadRequest)
		return
	}

	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// 2. Setup dynamic and discovery clients
	dc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Find GVR
	gr, err := restmapper.GetAPIGroupResources(dc)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	mapper := restmapper.NewDiscoveryRESTMapper(gr)
	gvk := obj.GroupVersionKind()
	mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 4. Apply using Server-Side Apply
	namespace := obj.GetNamespace()
	name := obj.GetName()

	var resource dynamic.ResourceInterface
	if mapping.Scope.Name() == "namespace" {
		resource = dyn.Resource(mapping.Resource).Namespace(namespace)
	} else {
		resource = dyn.Resource(mapping.Resource)
	}

	_, err = resource.Patch(r.Context(), name, types.ApplyPatchType, body, metav1.PatchOptions{
		FieldManager: "podscape-sidecar",
	})

	if err != nil {
		http.Error(w, "Apply failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleGetSecretValue(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	key := r.URL.Query().Get("key")

	if namespace == "" || name == "" || key == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	secret, err := cs.CoreV1().Secrets(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	val, ok := secret.Data[key]
	if !ok {
		http.Error(w, fmt.Sprintf("key %s not found in secret %s", key, name), http.StatusNotFound)
		return
	}

	w.Write(val)
}

func HandleExecOneShot(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	command := r.URL.Query()["command"]

	if pod == "" || namespace == "" || len(command) == 0 {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// Capture output
	out := &captureWriter{}
	errOut := &captureWriter{}

	err := exec.Exec(r.Context(), cs, cfg, namespace, pod, container, command, nil, out, errOut, false)

	resp := map[string]interface{}{
		"stdout": out.String(),
		"stderr": errOut.String(),
	}
	if err != nil {
		resp["error"] = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func HandleExec(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	pod := r.URL.Query().Get("pod")
	namespace := r.URL.Query().Get("namespace")
	container := r.URL.Query().Get("container")
	command := r.URL.Query()["command"]
	if len(command) == 0 {
		command = []string{"/bin/sh"}
	}

	if pod == "" || namespace == "" {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: pod and namespace are required"))
		return
	}

	log.Printf("[HandleExec] Starting interactive session for %s/%s/%s", namespace, pod, container)

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: no active context"))
		return
	}

	stream := &wsStream{conn: conn}
	err = exec.Exec(r.Context(), cs, cfg, namespace, pod, container, command, stream, stream, stream, true)
	if err != nil {
		log.Printf("[HandleExec] Session ended with error for %s/%s: %v", namespace, pod, err)
		conn.WriteMessage(websocket.TextMessage, []byte("\r\nExec failed: "+err.Error()))
	} else {
		log.Printf("[HandleExec] Session ended normally for %s/%s", namespace, pod)
	}
}

func HandleCPFrom(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	srcPath := r.URL.Query().Get("path")

	if pod == "" || namespace == "" || srcPath == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// Stream raw file bytes from the container using cat.
	// The client writes them directly to disk — no tar needed for download.
	content := &bytes.Buffer{}
	stderrBuf := &captureWriter{}
	catErr := exec.Exec(r.Context(), cs, cfg, namespace, pod, container,
		[]string{"cat", srcPath}, nil, content, stderrBuf, false)
	if catErr != nil {
		http.Error(w, "failed to read file from container: "+catErr.Error(), http.StatusInternalServerError)
		log.Printf("CP FROM cat failed for %s/%s %s: %v (stderr: %s)", namespace, pod, srcPath, catErr, stderrBuf.String())
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(content.Bytes())
}

func HandleCPTo(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	destPath := r.URL.Query().Get("path")

	if pod == "" || namespace == "" || destPath == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// The client packs the file as a tar with just the basename as the entry name.
	// Extract to the parent directory of destPath so the file lands at destPath.
	// stdout/stderr go to a buffer — writing them to w would trigger "superfluous WriteHeader".
	destDir := path.Dir(destPath)
	outBuf := &captureWriter{}
	command := []string{"tar", "xf", "-", "-C", destDir}
	err := exec.Exec(r.Context(), cs, cfg, namespace, pod, container, command, r.Body, outBuf, outBuf, false)
	if err != nil {
		http.Error(w, "CP TO failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
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

	// 5. Quick connectivity check (5s).
	checkCtx, checkCancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer checkCancel()
	if err := connectivityCheckFunc(clientset, checkCtx); err != nil {
		log.Printf("[SwitchContext] cluster %q unreachable (%v) — rolling back", contextName, err)

		// Rollback: restore old active cache and restart its informers.
		store.Store.Lock()
		store.Store.ActiveCache = oldCache
		store.Store.Unlock()

		if oldCache != nil {
			portforward.Manager.UpdateClients(oldCache.Clientset, oldCache.Config)
			go informers.RestartInformers(oldCache)
		}
		http.Error(w, fmt.Sprintf("cluster %q unreachable — reverted to previous context", contextName), http.StatusServiceUnavailable)
		return
	}

	// 6a. If we have cached data for this context, instant switch.
	newCache.RLock()
	hasData := newCache.HasData
	newCache.RUnlock()

	store.Store.Lock()
	store.Store.ActiveContextName = contextName
	store.Store.ActiveCache = newCache
	store.Store.Unlock()

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

func HandleHelmRollback(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	releaseName := r.URL.Query().Get("release")
	revisionStr := r.URL.Query().Get("revision")
	revision, err := strconv.Atoi(revisionStr)
	if err != nil || revisionStr == "" || revision <= 0 {
		http.Error(w, "invalid revision: must be a positive integer", http.StatusBadRequest)
		return
	}

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	if err = helm.RollbackRelease(kubeconfig, context, namespace, releaseName, revision); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
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

func HandleCreateDebugPod(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	image := r.URL.Query().Get("image")
	name := r.URL.Query().Get("name")

	if ns == "" || image == "" || name == "" {
		http.Error(w, "namespace, image, and name are required", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			Labels:    map[string]string{"created-by": "podscape"},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:    "debug",
					Image:   image,
					Command: []string{"sleep", "infinity"},
				},
			},
			RestartPolicy: corev1.RestartPolicyNever,
		},
	}

	_, err := cs.CoreV1().Pods(ns).Create(r.Context(), pod, metav1.CreateOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func HandleHelmUninstall(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	releaseName := r.URL.Query().Get("release")

	if namespace == "" || releaseName == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	_, err := helm.UninstallRelease(kubeconfig, context, namespace, releaseName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleRolloutHistory(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// Basic implementation: List ReplicaSets for Deployments or ControllerRevisions for StatefulSets
	var history interface{}
	var err error
	switch kind {
	case "deployment":
		list, e := cs.AppsV1().ReplicaSets(namespace).List(r.Context(), metav1.ListOptions{
			LabelSelector: fmt.Sprintf("app=%s", name), // This is a simplification
		})
		history = list
		err = e
	case "statefulset":
		list, e := cs.AppsV1().ControllerRevisions(namespace).List(r.Context(), metav1.ListOptions{
			LabelSelector: fmt.Sprintf("app=%s", name), // Simplification
		})
		history = list
		err = e
	default:
		err = fmt.Errorf("unsupported kind for rollout history: %s", kind)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

func HandleRolloutUndo(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	revisionStr := r.URL.Query().Get("revision")
	var targetRevision int64
	if revisionStr != "" {
		var parseErr error
		targetRevision, parseErr = strconv.ParseInt(revisionStr, 10, 64)
		if parseErr != nil || targetRevision < 0 {
			http.Error(w, "invalid revision: must be a non-negative integer", http.StatusBadRequest)
			return
		}
	}

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	var err error
	switch kind {
	case "deployment":
		err = undoDeploymentRollout(r.Context(), namespace, name, targetRevision)
	default:
		http.Error(w, fmt.Sprintf("rollout undo not supported for kind: %s", kind), http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// parseRevision reads the "deployment.kubernetes.io/revision" annotation and
// returns (revision, true) on success, or (0, false) if the annotation is
// absent or non-numeric. Centralises the repeated strconv.ParseInt call so
// callers can distinguish a missing annotation from an explicit revision 0.
func parseRevision(ann map[string]string) (int64, bool) {
	s, ok := ann["deployment.kubernetes.io/revision"]
	if !ok || s == "" {
		return 0, false
	}
	v, err := strconv.ParseInt(s, 10, 64)
	return v, err == nil
}

// undoDeploymentRollout reverts a Deployment to a previous revision by finding
// the matching ReplicaSet and patching the Deployment's pod template to match.
// If targetRevision is 0, it uses the second-most-recent revision (standard "undo").
func undoDeploymentRollout(ctx context.Context, namespace, name string, targetRevision int64) error {
	clientset, _ := store.Store.ActiveClientset()
	if clientset == nil {
		return fmt.Errorf("no active context")
	}

	deploy, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get deployment: %w", err)
	}
	currentRevision, hasRevision := parseRevision(deploy.Annotations)
	if !hasRevision {
		return fmt.Errorf("deployment %s has no revision annotation; rollout history not available", name)
	}

	// List ReplicaSets matching this deployment's selector.
	selector, err := metav1.LabelSelectorAsSelector(deploy.Spec.Selector)
	if err != nil {
		return fmt.Errorf("failed to build label selector: %w", err)
	}
	rsList, err := clientset.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selector.String(),
	})
	if err != nil {
		return fmt.Errorf("failed to list replicasets: %w", err)
	}

	// Keep only ReplicaSets owned by this deployment.
	owned := make([]appsv1.ReplicaSet, 0, len(rsList.Items))
	for _, rs := range rsList.Items {
		for _, ref := range rs.OwnerReferences {
			if ref.Kind == "Deployment" && ref.Name == name {
				owned = append(owned, rs)
				break
			}
		}
	}
	if len(owned) == 0 {
		return fmt.Errorf("no replicasets found for deployment %s", name)
	}

	// Find the target ReplicaSet by revision annotation.
	var targetRS *appsv1.ReplicaSet
	if targetRevision == 0 {
		// Find the highest revision that is NOT the current one.
		var bestRev int64
		for i := range owned {
			if rev, ok := parseRevision(owned[i].Annotations); ok && rev != currentRevision && rev > bestRev {
				bestRev = rev
				targetRS = &owned[i]
			}
		}
	} else {
		for i := range owned {
			if rev, ok := parseRevision(owned[i].Annotations); ok && rev == targetRevision {
				targetRS = &owned[i]
				break
			}
		}
	}
	if targetRS == nil {
		return fmt.Errorf("target revision not found (requested %d, current %d)", targetRevision, currentRevision)
	}

	// Patch the deployment's pod template to match the target ReplicaSet.
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		current, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return err
		}
		current.Spec.Template = targetRS.Spec.Template
		_, err = clientset.AppsV1().Deployments(namespace).Update(ctx, current, metav1.UpdateOptions{})
		return err
	})
}

type wsStream struct {
	conn *websocket.Conn
}

func (s *wsStream) Read(p []byte) (n int, err error) {
	_, message, err := s.conn.ReadMessage()
	if err != nil {
		return 0, err
	}
	copy(p, message)
	return len(message), nil
}

func (s *wsStream) Write(p []byte) (n int, err error) {
	err = s.conn.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

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

func HandleSecurityScan(w http.ResponseWriter, r *http.Request) {
	// Check for trivy before setting SSE headers — return machine-readable 503
	// so the frontend can show a proper "install trivy" callout.
	if _, err := osexec.LookPath("trivy"); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "trivy_not_found",
			"message": "trivy binary not found in PATH. Install trivy to enable image vulnerability scanning.",
		})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// 30-minute hard cap; the per-image trivy timeout (5m) means a stalled
	// image never blocks the whole scan for more than a few minutes each.
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	store.Store.RUnlock()

	args := []string{
		"k8s",
		"--format", "json",
		"--report", "summary",
		"--timeout", "5m0s", // per-image scan timeout
	}
	if kubeconfig != "" {
		args = append(args, "--kubeconfig", kubeconfig)
	}
	args = append(args, "--exclude-namespaces", "kube-system,kube-node-lease,kube-public,local-path-storage,gatekeeper-system")

	cmd := osexec.CommandContext(ctx, "trivy", args...)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		sseEvent(w, flusher, "error", "failed to create stdout pipe: "+err.Error())
		return
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		sseEvent(w, flusher, "error", "failed to create stderr pipe: "+err.Error())
		return
	}

	if err := cmd.Start(); err != nil {
		sseEvent(w, flusher, "error", "failed to start trivy: "+err.Error())
		return
	}

	// Stream stderr as progress events concurrently with stdout reading.
	var stderrWg sync.WaitGroup
	stderrWg.Add(1)
	go func() {
		defer stderrWg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			if line := scanner.Text(); line != "" {
				sseEvent(w, flusher, "progress", line)
			}
		}
	}()

	output, readErr := io.ReadAll(stdoutPipe)
	stderrWg.Wait()
	waitErr := cmd.Wait()

	if readErr != nil || waitErr != nil {
		msg := "trivy scan failed"
		if waitErr != nil {
			msg = waitErr.Error()
		}
		sseEvent(w, flusher, "error", msg)
		return
	}

	sseEvent(w, flusher, "result", string(output))
}

func HandleKubesec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	// Use kubesec Go package directly
	logger, _ := zap.NewProduction()
	defer logger.Sync()
	sugar := logger.Sugar()

	schemaConfig := ruler.NewDefaultSchemaConfig()
	schemaConfig.DisableValidation = true // Resources from cluster

	reports, err := ruler.NewRuleset(sugar).Run("Podscape", body, schemaConfig)
	if err != nil {
		http.Error(w, "Kubesec scan failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reports)
}

// KubesecIssue is a normalised kubesec finding we return to the frontend.
type KubesecIssue struct {
	ID       string `json:"id"`
	Reason   string `json:"reason"`
	Selector string `json:"selector"`
	Points   int    `json:"points"`
}

// KubesecBatchItem is the per-resource result in a batch scan.
type KubesecBatchItem struct {
	Score  int            `json:"score"`
	Issues []KubesecIssue `json:"issues"`
	Error  string         `json:"error,omitempty"`
}

const (
	kubesecMaxBatchSize = 500
	kubesecWorkers      = 8
)

// HandleKubesecBatch accepts a JSON array of Kubernetes resource objects,
// runs kubesec on each concurrently, and returns a parallel array of KubesecBatchItem.
// Resources that fail individually return an error string without aborting the rest.
// Batch is capped at 500 resources; the whole scan times out after 2 minutes.
func HandleKubesecBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	var resources []json.RawMessage
	if err := json.Unmarshal(body, &resources); err != nil {
		http.Error(w, "invalid JSON array: "+err.Error(), http.StatusBadRequest)
		return
	}

	if len(resources) > kubesecMaxBatchSize {
		http.Error(w, fmt.Sprintf("batch too large: max %d resources", kubesecMaxBatchSize), http.StatusRequestEntityTooLarge)
		return
	}

	if len(resources) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	logger, _ := zap.NewProduction()
	defer logger.Sync()
	sugar := logger.Sugar()

	schemaConfig := ruler.NewDefaultSchemaConfig()
	schemaConfig.DisableValidation = true

	results := make([]KubesecBatchItem, len(resources))

	// Dispatch work indices over a channel; each goroutine owns its own ruleset
	// (ruler.Ruleset is not goroutine-safe) and writes into a pre-allocated slice
	// at the given index — no two goroutines share an index.
	work := make(chan int, len(resources))
	for i := range resources {
		work <- i
	}
	close(work)

	numWorkers := kubesecWorkers
	if len(resources) < numWorkers {
		numWorkers = len(resources)
	}

	var wg sync.WaitGroup
	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			localRuleset := ruler.NewRuleset(sugar)
			for i := range work {
				select {
				case <-ctx.Done():
					results[i] = KubesecBatchItem{Error: "timeout"}
					continue
				default:
				}

				yamlBytes, err := yaml.JSONToYAML(resources[i])
				if err != nil {
					results[i] = KubesecBatchItem{Error: "json→yaml: " + err.Error()}
					continue
				}

				reports, err := localRuleset.Run("Podscape", yamlBytes, schemaConfig)
				if err != nil || len(reports) == 0 {
					msg := "no report"
					if err != nil {
						msg = err.Error()
					}
					results[i] = KubesecBatchItem{Error: msg}
					continue
				}

				rep := reports[0]
				item := KubesecBatchItem{Score: rep.Score}
				for _, a := range rep.Scoring.Advise {
					item.Issues = append(item.Issues, KubesecIssue{
						ID:       a.ID,
						Reason:   a.Reason,
						Selector: a.Selector,
						Points:   a.Points,
					})
				}
				results[i] = item
			}
		}()
	}
	wg.Wait()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func HandleTrivyImages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Workloads []struct {
			Image     string `json:"image"`
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
			Kind      string `json:"kind"`
		} `json:"workloads"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Workloads) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"Resources": []interface{}{}})
		return
	}

	if _, err := osexec.LookPath("trivy"); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "trivy_not_found",
			"message": "trivy binary not found in PATH. Install with: brew install trivy",
		})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Minute)
	defer cancel()

	// Deduplicate by image tag; preserve workload→image mapping.
	type wlEntry struct {
		name, namespace, kind string
	}
	imageWorkloads := make(map[string][]wlEntry)
	var imageOrder []string
	seen := make(map[string]bool)
	for _, wl := range req.Workloads {
		if wl.Image == "" {
			continue
		}
		if !seen[wl.Image] {
			seen[wl.Image] = true
			imageOrder = append(imageOrder, wl.Image)
		}
		imageWorkloads[wl.Image] = append(imageWorkloads[wl.Image], wlEntry{
			name:      wl.Name,
			namespace: wl.Namespace,
			kind:      wl.Kind,
		})
	}

	type resourceEntry struct {
		Namespace string        `json:"Namespace"`
		Kind      string        `json:"Kind"`
		Name      string        `json:"Name"`
		Results   []interface{} `json:"Results"`
	}

	var resources []resourceEntry

	for i, image := range imageOrder {
		select {
		case <-ctx.Done():
			sseEvent(w, flusher, "error", "scan timed out or was cancelled")
			return
		default:
		}

		sseEvent(w, flusher, "progress", fmt.Sprintf("[%d/%d] Scanning %s", i+1, len(imageOrder), image))

		cmd := osexec.CommandContext(ctx, "trivy", "image", "--format", "json", "--timeout", "10m0s", "--quiet", image)
		output, err := cmd.Output()
		if err != nil {
			sseEvent(w, flusher, "progress", fmt.Sprintf("Skipping %s: %s", image, err.Error()))
			continue
		}

		var trivyOut map[string]interface{}
		if jsonErr := json.Unmarshal(output, &trivyOut); jsonErr != nil {
			sseEvent(w, flusher, "progress", fmt.Sprintf("Skipping %s: failed to parse result", image))
			continue
		}

		var imageResults []interface{}
		if results, ok := trivyOut["Results"].([]interface{}); ok {
			imageResults = results
		}

		for _, wl := range imageWorkloads[image] {
			resources = append(resources, resourceEntry{
				Namespace: wl.namespace,
				Kind:      wl.kind,
				Name:      wl.name,
				Results:   imageResults,
			})
		}
	}

	resultJSON, err := json.Marshal(map[string]interface{}{"Resources": resources})
	if err != nil {
		sseEvent(w, flusher, "error", "failed to marshal results: "+err.Error())
		return
	}
	sseEvent(w, flusher, "result", string(resultJSON))
}

// ── Prometheus ──────────────────────────────────────────────────────────────

func HandlePrometheusStatus(w http.ResponseWriter, r *http.Request) {
	// If the renderer passes a manual URL override, apply it before probing.
	if u := r.URL.Query().Get("url"); u != "" {
		prometheus.SetManualURL(u)
	} else {
		// Explicitly clear any stale manual URL so auto-discovery takes over.
		prometheus.SetManualURL("")
	}
	result := prometheus.ProbePrometheus()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func HandlePrometheusQueryBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req prometheus.BatchQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	results := prometheus.QueryRangeBatch(req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// ── Owner Chain ─────────────────────────────────────────────────────────────

func HandleOwnerChain(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	namespace := r.URL.Query().Get("namespace")

	if kind == "" || name == "" {
		http.Error(w, "kind and name are required", http.StatusBadRequest)
		return
	}

	store.Store.RLock()
	c := store.Store.ActiveCache
	store.Store.RUnlock()
	if c == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	chain := ownerchain.BuildOwnerChain(c, kind, namespace, name)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chain)
}

// ── Helm Repo Browser ───────────────────────────────────────────────────────

func HandleHelmRepoList(w http.ResponseWriter, r *http.Request) {
	mgr := helm.GetRepoManager()
	repos, err := mgr.ListRepos()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(repos)
}

func HandleHelmRepoSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 30
	offset := 0
	if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
		limit = v
	}
	if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
		offset = v
	}

	mgr := helm.GetRepoManager()
	result := mgr.Search(query, limit, offset)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func HandleHelmRepoVersions(w http.ResponseWriter, r *http.Request) {
	repoName := r.URL.Query().Get("repo")
	chartName := r.URL.Query().Get("chart")
	if repoName == "" || chartName == "" {
		http.Error(w, "repo and chart are required", http.StatusBadRequest)
		return
	}

	mgr := helm.GetRepoManager()
	versions, err := mgr.GetVersions(repoName, chartName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(versions)
}

func HandleHelmRepoValues(w http.ResponseWriter, r *http.Request) {
	repoName := r.URL.Query().Get("repo")
	chartName := r.URL.Query().Get("chart")
	version := r.URL.Query().Get("version")
	if repoName == "" || chartName == "" || version == "" {
		http.Error(w, "repo, chart, and version are required", http.StatusBadRequest)
		return
	}

	mgr := helm.GetRepoManager()
	values, err := mgr.GetValues(repoName, chartName, version)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(values))
}

func HandleHelmRepoRefresh(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	mgr := helm.GetRepoManager()
	err := mgr.Refresh(func(msg string) {
		sseEvent(w, flusher, "progress", msg)
	})
	if err != nil {
		sseEvent(w, flusher, "error", err.Error())
		return
	}
	sseEvent(w, flusher, "result", "ok")
}

func HandleHelmInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		sseEvent(w, flusher, "error", "failed to read request body")
		return
	}

	err = helm.InstallFromJSON(body, func(msg string) {
		sseEvent(w, flusher, "progress", msg)
	})
	if err != nil {
		sseEvent(w, flusher, "error", err.Error())
		return
	}
	sseEvent(w, flusher, "result", "ok")
}

// ─── TLS Certificate Dashboard ────────────────────────────────────────────────

type TLSCertInfo struct {
	SecretName     string    `json:"secretName"`
	Namespace      string    `json:"namespace"`
	CommonName     string    `json:"commonName"`
	DNSNames       []string  `json:"dnsNames"`
	Issuer         string    `json:"issuer"`
	NotBefore      time.Time `json:"notBefore"`
	NotAfter       time.Time `json:"notAfter"`
	DaysLeft       int       `json:"daysLeft"`
	IsExpired      bool      `json:"isExpired"`
	IsExpiringSoon bool      `json:"isExpiringSoon"` // within 30 days
	Error          string    `json:"error,omitempty"`
}

func HandleTLSCerts(w http.ResponseWriter, r *http.Request) {
	c := store.Store.ActiveCache
	if c == nil {
		http.Error(w, "cluster not connected", http.StatusServiceUnavailable)
		return
	}

	ns := r.URL.Query().Get("namespace")
	var certs []TLSCertInfo

	c.RLock()
	secrets := make(map[string]interface{}, len(c.Secrets))
	for k, v := range c.Secrets {
		secrets[k] = v
	}
	c.RUnlock()

	for _, raw := range secrets {
		secret, ok := raw.(*corev1.Secret)
		if !ok {
			continue
		}
		if ns != "" && secret.Namespace != ns {
			continue
		}
		if secret.Type != "kubernetes.io/tls" {
			continue
		}

		info := TLSCertInfo{
			SecretName: secret.Name,
			Namespace:  secret.Namespace,
		}

		certData, ok := secret.Data["tls.crt"]
		if !ok || len(certData) == 0 {
			info.Error = "missing tls.crt"
			certs = append(certs, info)
			continue
		}

		// Attempt PEM decode; fall back to base64 then PEM
		var certBytes []byte
		if block, _ := pem.Decode(certData); block != nil {
			certBytes = certData
		} else {
			decoded, err := base64.StdEncoding.DecodeString(string(certData))
			if err == nil {
				certBytes = decoded
			} else {
				certBytes = certData
			}
		}

		block, _ := pem.Decode(certBytes)
		if block == nil {
			info.Error = "invalid PEM"
			certs = append(certs, info)
			continue
		}

		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			info.Error = "parse error: " + err.Error()
			certs = append(certs, info)
			continue
		}

		daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
		info.CommonName = cert.Subject.CommonName
		info.DNSNames = cert.DNSNames
		info.Issuer = cert.Issuer.CommonName
		info.NotBefore = cert.NotBefore
		info.NotAfter = cert.NotAfter
		info.DaysLeft = daysLeft
		info.IsExpired = daysLeft < 0
		info.IsExpiringSoon = daysLeft >= 0 && daysLeft <= 30

		certs = append(certs, info)
	}

	if certs == nil {
		certs = []TLSCertInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(certs)
}

// ─── GitOps Panel ─────────────────────────────────────────────────────────────

type GitOpsResource struct {
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Status    string            `json:"status"`
	Ready     bool              `json:"ready"`
	Labels    map[string]string `json:"labels,omitempty"`
	Source    string            `json:"source,omitempty"`
	Revision  string            `json:"revision,omitempty"`
	Message   string            `json:"message,omitempty"`
}

type GitOpsResponse struct {
	FluxDetected bool             `json:"fluxDetected"`
	ArgoDetected bool             `json:"argoDetected"`
	Resources    []GitOpsResource `json:"resources"`
}

var gitopsGVRs = []schema.GroupVersionResource{
	// Flux v2
	{Group: "kustomize.toolkit.fluxcd.io", Version: "v1", Resource: "kustomizations"},
	{Group: "kustomize.toolkit.fluxcd.io", Version: "v1beta2", Resource: "kustomizations"},
	{Group: "helm.toolkit.fluxcd.io", Version: "v2", Resource: "helmreleases"},
	{Group: "helm.toolkit.fluxcd.io", Version: "v2beta1", Resource: "helmreleases"},
	{Group: "source.toolkit.fluxcd.io", Version: "v1", Resource: "gitrepositories"},
	{Group: "source.toolkit.fluxcd.io", Version: "v1beta2", Resource: "helmrepositories"},
	// Argo CD
	{Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"},
	{Group: "argoproj.io", Version: "v1alpha1", Resource: "appprojects"},
}

func HandleGitOps(w http.ResponseWriter, r *http.Request) {
	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "cluster not connected", http.StatusServiceUnavailable)
		return
	}

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, "failed to create dynamic client: "+err.Error(), http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	ns := r.URL.Query().Get("namespace")

	resp := GitOpsResponse{Resources: []GitOpsResource{}}

	for _, gvr := range gitopsGVRs {
		var list *unstructured.UnstructuredList
		var listErr error

		if ns != "" {
			list, listErr = dynClient.Resource(gvr).Namespace(ns).List(ctx, metav1.ListOptions{})
		} else {
			list, listErr = dynClient.Resource(gvr).Namespace("").List(ctx, metav1.ListOptions{})
		}
		if listErr != nil {
			// Resource type doesn't exist in this cluster — skip silently
			continue
		}

		group := gvr.Group
		if strings.Contains(group, "fluxcd.io") {
			resp.FluxDetected = true
		} else if strings.Contains(group, "argoproj.io") {
			resp.ArgoDetected = true
		}

		for _, item := range list.Items {
			gr := GitOpsResource{
				Kind:      item.GetKind(),
				Name:      item.GetName(),
				Namespace: item.GetNamespace(),
				Labels:    item.GetLabels(),
			}

			// Extract status conditions
			conditions, _, _ := unstructured.NestedSlice(item.Object, "status", "conditions")
			for _, cond := range conditions {
				c, ok := cond.(map[string]interface{})
				if !ok {
					continue
				}
				condType, _ := c["type"].(string)
				condStatus, _ := c["status"].(string)
				msg, _ := c["message"].(string)
				if condType == "Ready" || condType == "ReconcileSucceeded" || condType == "Healthy" {
					gr.Ready = condStatus == "True"
					gr.Message = msg
					if gr.Ready {
						gr.Status = "Ready"
					} else {
						gr.Status = "NotReady"
					}
				}
			}

			// Argo CD health
			healthStatus, _, _ := unstructured.NestedString(item.Object, "status", "health", "status")
			if healthStatus != "" {
				gr.Status = healthStatus
				gr.Ready = healthStatus == "Healthy"
			}
			syncStatus, _, _ := unstructured.NestedString(item.Object, "status", "sync", "status")
			if syncStatus != "" && gr.Status == "" {
				gr.Status = syncStatus
			}

			// Source ref
			sourceRef, _, _ := unstructured.NestedMap(item.Object, "spec", "sourceRef")
			if name, ok := sourceRef["name"].(string); ok {
				gr.Source = name
			}
			repoURL, _, _ := unstructured.NestedString(item.Object, "spec", "url")
			if repoURL != "" && gr.Source == "" {
				gr.Source = repoURL
			}

			// Revision
			revision, _, _ := unstructured.NestedString(item.Object, "status", "lastAppliedRevision")
			if revision == "" {
				revision, _, _ = unstructured.NestedString(item.Object, "status", "observedRevision")
			}
			gr.Revision = revision

			if gr.Status == "" {
				gr.Status = "Unknown"
			}
			resp.Resources = append(resp.Resources, gr)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleCordonNode cordons (unschedulable=true) or uncordons (unschedulable=false) a node.
// Query params: name (required), unschedulable (true|false, default true)
func HandleCordonNode(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "missing name", http.StatusBadRequest)
		return
	}
	unschedulable := r.URL.Query().Get("unschedulable") != "false"

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	patch := []byte(fmt.Sprintf(`{"spec":{"unschedulable":%v}}`, unschedulable))
	if _, err := cs.CoreV1().Nodes().Patch(r.Context(), name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// HandleDrainNode cordons the node then deletes all evictable pods (skips DaemonSet-owned and mirror pods).
func HandleDrainNode(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "missing name", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// 1. Cordon the node first.
	cordonPatch := []byte(`{"spec":{"unschedulable":true}}`)
	if _, err := cs.CoreV1().Nodes().Patch(r.Context(), name, types.MergePatchType, cordonPatch, metav1.PatchOptions{}); err != nil {
		http.Error(w, "cordon failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 2. List all pods scheduled on this node.
	pods, err := cs.CoreV1().Pods("").List(r.Context(), metav1.ListOptions{
		FieldSelector: fmt.Sprintf("spec.nodeName=%s", name),
	})
	if err != nil {
		http.Error(w, "list pods failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Delete evictable pods (skip DaemonSet-owned and mirror/static pods).
	var errs []string
	for _, pod := range pods.Items {
		isDaemonSet := false
		for _, ref := range pod.OwnerReferences {
			if ref.Kind == "DaemonSet" {
				isDaemonSet = true
				break
			}
		}
		if isDaemonSet {
			continue
		}
		if _, isMirror := pod.Annotations["kubernetes.io/config.mirror"]; isMirror {
			continue
		}
		if delErr := cs.CoreV1().Pods(pod.Namespace).Delete(r.Context(), pod.Name, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
			errs = append(errs, fmt.Sprintf("%s/%s: %v", pod.Namespace, pod.Name, delErr))
		}
	}

	if len(errs) > 0 {
		http.Error(w, "drain partial failure: "+strings.Join(errs, "; "), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}
