package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/podscape/go-core/internal/store"
)

// Specific handlers for common resources.
// Each handler registers a direct k8s API fallback used when the informer
// cache is cold (HasData=false), providing kubectl-like cold-start speed.
// CRDs are omitted from the fallback — they require the apiextensions client
// which is not stored in the ContextCache Clientset.
var (
	HandleNodes = MakeHandler("nodes", func(c *store.ContextCache) map[string]interface{} { return c.Nodes },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePods = MakeHandler("pods", func(c *store.ContextCache) map[string]interface{} { return c.Pods },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleDeployments = MakeHandler("deployments", func(c *store.ContextCache) map[string]interface{} { return c.Deployments },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Workloads
	HandleDaemonSets = MakeHandler("daemonsets", func(c *store.ContextCache) map[string]interface{} { return c.DaemonSets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleStatefulSets = MakeHandler("statefulsets", func(c *store.ContextCache) map[string]interface{} { return c.StatefulSets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleReplicaSets = MakeHandler("replicasets", func(c *store.ContextCache) map[string]interface{} { return c.ReplicaSets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleJobs = MakeHandler("jobs", func(c *store.ContextCache) map[string]interface{} { return c.Jobs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleCronJobs = MakeHandler("cronjobs", func(c *store.ContextCache) map[string]interface{} { return c.CronJobs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.BatchV1().CronJobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleHPAs = MakeHandler("horizontalpodautoscalers", func(c *store.ContextCache) map[string]interface{} { return c.HPAs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AutoscalingV1().HorizontalPodAutoscalers(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePDBs = MakeHandler("poddisruptionbudgets", func(c *store.ContextCache) map[string]interface{} { return c.PDBs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.PolicyV1().PodDisruptionBudgets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Networking
	HandleServices = MakeHandler("services", func(c *store.ContextCache) map[string]interface{} { return c.Services },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleIngresses = MakeHandler("ingresses", func(c *store.ContextCache) map[string]interface{} { return c.Ingresses },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleIngressClasses = MakeHandler("ingressclasses", func(c *store.ContextCache) map[string]interface{} { return c.IngressClasses },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().IngressClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleNetworkPolicies = MakeHandler("networkpolicies", func(c *store.ContextCache) map[string]interface{} { return c.NetworkPolicies },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().NetworkPolicies(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleEndpoints = MakeHandler("endpoints", func(c *store.ContextCache) map[string]interface{} { return c.Endpoints },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Endpoints(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Config & Storage
	HandleConfigMaps = MakeHandler("configmaps", func(c *store.ContextCache) map[string]interface{} { return c.ConfigMaps },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().ConfigMaps(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleSecrets = MakeHandler("secrets", func(c *store.ContextCache) map[string]interface{} { return c.Secrets },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePVCs = MakeHandler("persistentvolumeclaims", func(c *store.ContextCache) map[string]interface{} { return c.PVCs },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().PersistentVolumeClaims(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandlePVs = MakeHandler("persistentvolumes", func(c *store.ContextCache) map[string]interface{} { return c.PVs },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleStorageClasses = MakeHandler("storageclasses", func(c *store.ContextCache) map[string]interface{} { return c.StorageClasses },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})

	// Cluster & RBAC
	HandleNamespaces = MakeHandler("namespaces", func(c *store.ContextCache) map[string]interface{} { return c.Namespaces },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleServiceAccounts = MakeHandler("serviceaccounts", func(c *store.ContextCache) map[string]interface{} { return c.ServiceAccounts },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().ServiceAccounts(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleRoles = MakeHandler("roles", func(c *store.ContextCache) map[string]interface{} { return c.Roles },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.RbacV1().Roles(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleClusterRoles = MakeHandler("clusterroles", func(c *store.ContextCache) map[string]interface{} { return c.ClusterRoles },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleRoleBindings = MakeHandler("rolebindings", func(c *store.ContextCache) map[string]interface{} { return c.RoleBindings },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleClusterRoleBindings = MakeHandler("clusterrolebindings", func(c *store.ContextCache) map[string]interface{} { return c.ClusterRoleBindings },
		func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
	HandleEvents = MakeHandler("events", func(c *store.ContextCache) map[string]interface{} { return c.Events },
		func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Events(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		})
)

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
