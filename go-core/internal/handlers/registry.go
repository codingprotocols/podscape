package handlers

import (
	"context"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/podscape/go-core/internal/store"
)

// ResourceDef is the single source of truth for a standard Kubernetes resource.
// It carries everything needed to register an HTTP route and build a handler:
// the RBAC probe key, HTTP path, cache accessor, and live-API fallback.
//
// Adding a new standard resource now requires only one entry here (plus a field
// on store.ContextCache and an informer in informers.go).
//
// Resources with bespoke handler logic (events, crds) are NOT in this list —
// they are registered manually in main.go.
type ResourceDef struct {
	// Resource is the lowercase plural name used as the MakeHandler RBAC key
	// (must match the corresponding entry in rbac.AllResources).
	Resource string
	// SidecarPath is the HTTP route suffix (e.g. "hpas"). Empty means same as Resource.
	SidecarPath string
	// GetCache returns the resource map from the active ContextCache.
	GetCache func(*store.ContextCache) map[string]interface{}
	// ListFn is the direct k8s API fallback used when the informer cache is cold.
	ListFn func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error)
}

// Path returns the HTTP route path for this resource.
func (rd ResourceDef) Path() string {
	if rd.SidecarPath != "" {
		return rd.SidecarPath
	}
	return rd.Resource
}

// Handler builds and returns the http.HandlerFunc for this resource.
func (rd ResourceDef) Handler() http.HandlerFunc {
	return MakeHandler(rd.Resource, rd.GetCache, rd.ListFn)
}

// HandlerForResource returns the http.HandlerFunc for the given resource name
// (e.g. "pods"). Returns nil if the resource is not in AllResourceDefs.
// Intended for use in tests that need a named handler without importing a
// specific package-level var.
func HandlerForResource(resource string) http.HandlerFunc {
	for _, rd := range AllResourceDefs {
		if rd.Resource == resource {
			return rd.Handler()
		}
	}
	return nil
}

// AllResourceDefs is the registry of every standard resource served by MakeHandler.
// main.go iterates this slice to register HTTP routes — no manual HandleFunc
// calls are needed for these resources.
var AllResourceDefs = []ResourceDef{
	// ── Critical (needed for dashboard on first load) ───────────────────────
	{
		Resource: "nodes",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Nodes },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "namespaces",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Namespaces },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "pods",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Pods },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "deployments",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Deployments },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},

	// ── Workloads ────────────────────────────────────────────────────────────
	{
		Resource: "daemonsets",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.DaemonSets },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "statefulsets",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.StatefulSets },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "replicasets",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.ReplicaSets },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "jobs",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Jobs },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "cronjobs",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.CronJobs },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.BatchV1().CronJobs(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource:    "horizontalpodautoscalers",
		SidecarPath: "hpas",
		GetCache:    func(c *store.ContextCache) map[string]interface{} { return c.HPAs },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.AutoscalingV2().HorizontalPodAutoscalers(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource:    "poddisruptionbudgets",
		SidecarPath: "pdbs",
		GetCache:    func(c *store.ContextCache) map[string]interface{} { return c.PDBs },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.PolicyV1().PodDisruptionBudgets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},

	// ── Networking ───────────────────────────────────────────────────────────
	{
		Resource: "services",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Services },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "ingresses",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Ingresses },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "ingressclasses",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.IngressClasses },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().IngressClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "networkpolicies",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.NetworkPolicies },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.NetworkingV1().NetworkPolicies(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "endpoints",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Endpoints },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Endpoints(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},

	// ── Config & Storage ─────────────────────────────────────────────────────
	{
		Resource: "configmaps",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.ConfigMaps },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().ConfigMaps(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "secrets",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Secrets },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource:    "persistentvolumeclaims",
		SidecarPath: "pvcs",
		GetCache:    func(c *store.ContextCache) map[string]interface{} { return c.PVCs },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().PersistentVolumeClaims(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource:    "persistentvolumes",
		SidecarPath: "pvs",
		GetCache:    func(c *store.ContextCache) map[string]interface{} { return c.PVs },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "storageclasses",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.StorageClasses },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},

	// ── RBAC & Cluster ───────────────────────────────────────────────────────
	{
		Resource: "serviceaccounts",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.ServiceAccounts },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.CoreV1().ServiceAccounts(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "roles",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.Roles },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.RbacV1().Roles(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "clusterroles",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.ClusterRoles },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "rolebindings",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.RoleBindings },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, ns string) ([]interface{}, error) {
			list, err := cs.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
	{
		Resource: "clusterrolebindings",
		GetCache: func(c *store.ContextCache) map[string]interface{} { return c.ClusterRoleBindings },
		ListFn: func(ctx context.Context, cs kubernetes.Interface, _ string) ([]interface{}, error) {
			list, err := cs.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
			if err != nil {
				return nil, err
			}
			return listToIface(list.Items), nil
		},
	},
}
