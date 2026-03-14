package informers

import (
	"fmt"
	"log"
	"time"

	"github.com/podscape/go-core/internal/store"
	k8sinformers "k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// InitInformers starts the critical informers (those needed for the dashboard
// on first load) and blocks until they are synced, then starts all remaining
// informers in the background without blocking.
//
// This splits a ~30 informer sync into a fast critical path (5 types) plus a
// background phase, so /health returns 200 as soon as the dashboard has data.
func InitInformers(clientset *kubernetes.Clientset, stopCh <-chan struct{}) {
	factory := k8sinformers.NewSharedInformerFactory(clientset, time.Minute*10)

	registerCriticalInformers(factory)
	factory.Start(stopCh)
	factory.WaitForCacheSync(stopCh)

	// Start everything else without blocking startup.
	go func() {
		registerBackgroundInformers(factory)
		factory.Start(stopCh) // no-op for already-started informers; starts new ones
		log.Println("[Informers] background cache sync complete")
	}()
}

// SyncInformers is used on context switches. It blocks only until the critical
// informers are synced (same fast path as startup), then starts background
// informers without blocking so the HTTP response returns quickly.
func SyncInformers(clientset *kubernetes.Clientset, stopCh <-chan struct{}, timeout time.Duration) {
	factory := k8sinformers.NewSharedInformerFactory(clientset, time.Minute*10)
	registerCriticalInformers(factory)
	factory.Start(stopCh)

	done := make(chan struct{})
	go func() {
		factory.WaitForCacheSync(stopCh)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(timeout):
		log.Printf("[Informers] critical cache sync timed out after %s, serving partial data", timeout)
	}

	go func() {
		registerBackgroundInformers(factory)
		factory.Start(stopCh)
		log.Println("[Informers] background cache sync complete after context switch")
	}()
}

// StartInformers starts all informers without blocking. Used after context
// switches when the caller has already returned a response to the UI.
func StartInformers(clientset *kubernetes.Clientset, stopCh <-chan struct{}) {
	factory := k8sinformers.NewSharedInformerFactory(clientset, time.Minute*10)
	registerCriticalInformers(factory)
	registerBackgroundInformers(factory)
	factory.Start(stopCh)
}

// registerCriticalInformers registers only the resource types required for the
// dashboard on first load. These are synced before /health returns 200.
func registerCriticalInformers(factory k8sinformers.SharedInformerFactory) {
	setupInformer(factory.Core().V1().Namespaces().Informer(), store.Store.Namespaces, false)
	setupInformer(factory.Core().V1().Nodes().Informer(), store.Store.Nodes, false)
	setupInformer(factory.Core().V1().Pods().Informer(), store.Store.Pods, true)
	setupInformer(factory.Apps().V1().Deployments().Informer(), store.Store.Deployments, true)
	setupInformer(factory.Core().V1().Events().Informer(), store.Store.Events, true)
}

// registerBackgroundInformers registers everything else. These start after the
// critical path so they don't delay startup.
func registerBackgroundInformers(factory k8sinformers.SharedInformerFactory) {
	// Workloads
	setupInformer(factory.Apps().V1().DaemonSets().Informer(), store.Store.DaemonSets, true)
	setupInformer(factory.Apps().V1().StatefulSets().Informer(), store.Store.StatefulSets, true)
	setupInformer(factory.Apps().V1().ReplicaSets().Informer(), store.Store.ReplicaSets, true)
	setupInformer(factory.Batch().V1().Jobs().Informer(), store.Store.Jobs, true)
	setupInformer(factory.Batch().V1().CronJobs().Informer(), store.Store.CronJobs, true)
	setupInformer(factory.Autoscaling().V1().HorizontalPodAutoscalers().Informer(), store.Store.HPAs, true)
	setupInformer(factory.Policy().V1().PodDisruptionBudgets().Informer(), store.Store.PDBs, true)

	// Networking
	setupInformer(factory.Core().V1().Services().Informer(), store.Store.Services, true)
	setupInformer(factory.Networking().V1().Ingresses().Informer(), store.Store.Ingresses, true)
	setupInformer(factory.Networking().V1().IngressClasses().Informer(), store.Store.IngressClasses, false)
	setupInformer(factory.Networking().V1().NetworkPolicies().Informer(), store.Store.NetworkPolicies, true)
	setupInformer(factory.Core().V1().Endpoints().Informer(), store.Store.Endpoints, true)

	// Config & Storage
	setupInformer(factory.Core().V1().ConfigMaps().Informer(), store.Store.ConfigMaps, true)
	setupInformer(factory.Core().V1().Secrets().Informer(), store.Store.Secrets, true)
	setupInformer(factory.Core().V1().PersistentVolumeClaims().Informer(), store.Store.PVCs, true)
	setupInformer(factory.Core().V1().PersistentVolumes().Informer(), store.Store.PVs, false)
	setupInformer(factory.Storage().V1().StorageClasses().Informer(), store.Store.StorageClasses, false)

	// RBAC
	setupInformer(factory.Core().V1().ServiceAccounts().Informer(), store.Store.ServiceAccounts, true)
	setupInformer(factory.Rbac().V1().Roles().Informer(), store.Store.Roles, true)
	setupInformer(factory.Rbac().V1().ClusterRoles().Informer(), store.Store.ClusterRoles, false)
	setupInformer(factory.Rbac().V1().RoleBindings().Informer(), store.Store.RoleBindings, true)
	setupInformer(factory.Rbac().V1().ClusterRoleBindings().Informer(), store.Store.ClusterRoleBindings, false)
}

// registerInformers registers all informers (critical + background) at once.
// Used by SyncInformers for context switches where we want everything in one shot.
func registerInformers(factory k8sinformers.SharedInformerFactory) {
	registerCriticalInformers(factory)
	registerBackgroundInformers(factory)
}

func setupInformer(informer cache.SharedIndexInformer, targetMap map[string]interface{}, namespaced bool) {
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			key := getResourceKey(obj, namespaced)
			store.Store.Lock()
			targetMap[key] = obj
			store.Store.Unlock()
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			key := getResourceKey(newObj, namespaced)
			store.Store.Lock()
			targetMap[key] = newObj
			store.Store.Unlock()
		},
		DeleteFunc: func(obj interface{}) {
			key := getResourceKey(obj, namespaced)
			store.Store.Lock()
			delete(targetMap, key)
			store.Store.Unlock()
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
