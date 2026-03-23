package informers

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/podscape/go-core/internal/store"
	apiextinformers "k8s.io/apiextensions-apiserver/pkg/client/informers/externalversions"
	k8sinformers "k8s.io/client-go/informers"
	"k8s.io/client-go/tools/cache"
)

// InitInformers starts the critical informers (those needed for the dashboard
// on first load) and blocks until they are synced or the timeout elapses, then
// starts all remaining informers in the background without blocking.
//
// This splits a ~30 informer sync into a fast critical path (5 types) plus a
// background phase, so /health returns 200 as soon as the dashboard has data.
// The 60-second timeout prevents large/slow clusters from triggering the
// Electron-side 90-second startup timeout — informers continue syncing in
// the background and data appears once they complete.
func InitInformers(c *store.ContextCache, stopCh <-chan struct{}) {
	factory := k8sinformers.NewSharedInformerFactory(c.Clientset, time.Minute*10)

	registerCriticalInformers(factory, c)
	factory.Start(stopCh)

	done := make(chan struct{})
	go func() {
		factory.WaitForCacheSync(stopCh)
		close(done)
	}()

	select {
	case <-done:
		// Critical informers synced — dashboard will have data immediately.
	case <-time.After(60 * time.Second):
		log.Println("[Informers] critical cache sync timed out after 60s, serving partial data")
	}

	// Start everything else without blocking startup.
	go func() {
		registerBackgroundInformers(factory, c, stopCh)
		factory.Start(stopCh) // no-op for already-started informers; starts new ones
		c.Lock()
		c.HasData = true
		c.Unlock()
		log.Println("[Informers] background cache sync complete")
	}()
}

// SyncInformers is used on context switches. It blocks only until the critical
// informers are synced (same fast path as startup), then starts background
// informers without blocking so the HTTP response returns quickly.
// Returns true if critical informers synced before the timeout, false on timeout.
func SyncInformers(c *store.ContextCache, stopCh <-chan struct{}, timeout time.Duration) bool {
	factory := k8sinformers.NewSharedInformerFactory(c.Clientset, time.Minute*10)
	registerCriticalInformers(factory, c)
	factory.Start(stopCh)

	done := make(chan struct{})
	go func() {
		factory.WaitForCacheSync(stopCh)
		close(done)
	}()

	synced := false
	select {
	case <-done:
		synced = true
	case <-time.After(timeout):
		log.Printf("[Informers] critical cache sync timed out after %s, serving partial data", timeout)
	}

	go func() {
		registerBackgroundInformers(factory, c, stopCh)
		factory.Start(stopCh)
		c.Lock()
		c.HasData = true
		c.Unlock()
		log.Println("[Informers] background cache sync complete after context switch")
	}()

	return synced
}

// StartInformers starts all informers without blocking. Used after context
// switches when the caller has already returned a response to the UI.
func StartInformers(c *store.ContextCache, stopCh <-chan struct{}) {
	factory := k8sinformers.NewSharedInformerFactory(c.Clientset, time.Minute*10)
	registerCriticalInformers(factory, c)
	registerBackgroundInformers(factory, c, stopCh)
	factory.Start(stopCh)
}

// RestartInformers creates a fresh StopCh on the cache and starts all informers
// in the background. Used when switching back to a known context whose informers
// were stopped.
func RestartInformers(c *store.ContextCache) {
	newStopCh := make(chan struct{})
	c.Lock()
	c.StopCh = newStopCh
	c.CacheReady = false // will flip back to true after re-sync
	c.Unlock()
	go StartInformers(c, newStopCh)
}

// registerCriticalInformers registers only the resource types required for the
// dashboard on first load. These are synced before /health returns 200.
func registerCriticalInformers(factory k8sinformers.SharedInformerFactory, c *store.ContextCache) {
	// Read AllowedResources once under a read-lock; nil means "not yet probed —
	// start all informers" (permissive default preserves pre-RBAC behaviour).
	c.RLock()
	allowed := c.AllowedResources
	c.RUnlock()

	if rbacAllowed(allowed, "namespaces") {
		setupInformer(factory.Core().V1().Namespaces().Informer(), c.Namespaces, &c.RWMutex, false)
	}
	if rbacAllowed(allowed, "nodes") {
		setupInformer(factory.Core().V1().Nodes().Informer(), c.Nodes, &c.RWMutex, false)
	}
	if rbacAllowed(allowed, "pods") {
		setupInformer(factory.Core().V1().Pods().Informer(), c.Pods, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "deployments") {
		setupInformer(factory.Apps().V1().Deployments().Informer(), c.Deployments, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "events") {
		setupInformer(factory.Core().V1().Events().Informer(), c.Events, &c.RWMutex, true)
	}
}

// registerBackgroundInformers registers everything else. These start after the
// critical path so they don't delay startup.
func registerBackgroundInformers(factory k8sinformers.SharedInformerFactory, c *store.ContextCache, stopCh <-chan struct{}) {
	c.RLock()
	allowed := c.AllowedResources
	apiextClient := c.ApiextensionsClientset
	c.RUnlock()

	// Workloads
	if rbacAllowed(allowed, "daemonsets") {
		setupInformer(factory.Apps().V1().DaemonSets().Informer(), c.DaemonSets, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "statefulsets") {
		setupInformer(factory.Apps().V1().StatefulSets().Informer(), c.StatefulSets, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "replicasets") {
		setupInformer(factory.Apps().V1().ReplicaSets().Informer(), c.ReplicaSets, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "jobs") {
		setupInformer(factory.Batch().V1().Jobs().Informer(), c.Jobs, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "cronjobs") {
		setupInformer(factory.Batch().V1().CronJobs().Informer(), c.CronJobs, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "horizontalpodautoscalers") {
		setupInformer(factory.Autoscaling().V2().HorizontalPodAutoscalers().Informer(), c.HPAs, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "poddisruptionbudgets") {
		setupInformer(factory.Policy().V1().PodDisruptionBudgets().Informer(), c.PDBs, &c.RWMutex, true)
	}

	// Networking
	if rbacAllowed(allowed, "services") {
		setupInformer(factory.Core().V1().Services().Informer(), c.Services, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "ingresses") {
		setupInformer(factory.Networking().V1().Ingresses().Informer(), c.Ingresses, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "ingressclasses") {
		setupInformer(factory.Networking().V1().IngressClasses().Informer(), c.IngressClasses, &c.RWMutex, false)
	}
	if rbacAllowed(allowed, "networkpolicies") {
		setupInformer(factory.Networking().V1().NetworkPolicies().Informer(), c.NetworkPolicies, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "endpoints") {
		setupInformer(factory.Core().V1().Endpoints().Informer(), c.Endpoints, &c.RWMutex, true)
	}

	// Config & Storage
	if rbacAllowed(allowed, "configmaps") {
		setupInformer(factory.Core().V1().ConfigMaps().Informer(), c.ConfigMaps, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "secrets") {
		setupInformer(factory.Core().V1().Secrets().Informer(), c.Secrets, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "persistentvolumeclaims") {
		setupInformer(factory.Core().V1().PersistentVolumeClaims().Informer(), c.PVCs, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "persistentvolumes") {
		setupInformer(factory.Core().V1().PersistentVolumes().Informer(), c.PVs, &c.RWMutex, false)
	}
	if rbacAllowed(allowed, "storageclasses") {
		setupInformer(factory.Storage().V1().StorageClasses().Informer(), c.StorageClasses, &c.RWMutex, false)
	}

	// RBAC resources
	if rbacAllowed(allowed, "serviceaccounts") {
		setupInformer(factory.Core().V1().ServiceAccounts().Informer(), c.ServiceAccounts, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "roles") {
		setupInformer(factory.Rbac().V1().Roles().Informer(), c.Roles, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "clusterroles") {
		setupInformer(factory.Rbac().V1().ClusterRoles().Informer(), c.ClusterRoles, &c.RWMutex, false)
	}
	if rbacAllowed(allowed, "rolebindings") {
		setupInformer(factory.Rbac().V1().RoleBindings().Informer(), c.RoleBindings, &c.RWMutex, true)
	}
	if rbacAllowed(allowed, "clusterrolebindings") {
		setupInformer(factory.Rbac().V1().ClusterRoleBindings().Informer(), c.ClusterRoleBindings, &c.RWMutex, false)
	}

	// CRDs — requires the separate apiextensions client
	if apiextClient != nil && rbacAllowed(allowed, "customresourcedefinitions") {
		apiextFactory := apiextinformers.NewSharedInformerFactory(apiextClient, time.Minute*10)
		setupInformer(apiextFactory.Apiextensions().V1().CustomResourceDefinitions().Informer(), c.CRDs, &c.RWMutex, false)
		apiextFactory.Start(stopCh)
	}
}

// rbacAllowed returns true when the resource should have an informer started.
// A nil allowed map means the RBAC probe has not run yet (or failed) — treat
// all resources as allowed to preserve pre-RBAC behaviour.
func rbacAllowed(allowed map[string]bool, resource string) bool {
	if allowed == nil {
		return true
	}
	return allowed[resource]
}

// setupInformer registers Add/Update/Delete event handlers that write to
// targetMap under mu (a write-lock on the owning ContextCache).
func setupInformer(informer cache.SharedIndexInformer, targetMap map[string]interface{}, mu sync.Locker, namespaced bool) {
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			key := getResourceKey(obj, namespaced)
			mu.Lock()
			targetMap[key] = obj
			mu.Unlock()
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			key := getResourceKey(newObj, namespaced)
			mu.Lock()
			targetMap[key] = newObj
			mu.Unlock()
		},
		DeleteFunc: func(obj interface{}) {
			key := getResourceKey(obj, namespaced)
			mu.Lock()
			delete(targetMap, key)
			mu.Unlock()
		},
	})
}

func getResourceKey(obj interface{}, namespaced bool) string {
	if !namespaced {
		if meta, ok := obj.(interface{ GetName() string }); ok {
			return meta.GetName()
		}
	} else {
		if meta, ok := obj.(interface {
			GetNamespace() string
			GetName() string
		}); ok {
			return fmt.Sprintf("%s/%s", meta.GetNamespace(), meta.GetName())
		}
	}
	return ""
}
