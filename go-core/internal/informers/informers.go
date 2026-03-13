package informers

import (
	"fmt"
	"time"

	"github.com/podscape/go-core/internal/store"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

func InitInformers(clientset *kubernetes.Clientset, stopCh <-chan struct{}) {
	factory := informers.NewSharedInformerFactory(clientset, time.Minute*10)

	// Workloads
	setupInformer(factory.Core().V1().Pods().Informer(), store.Store.Pods, true)
	setupInformer(factory.Apps().V1().Deployments().Informer(), store.Store.Deployments, true)
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

	// Cluster & RBAC
	setupInformer(factory.Core().V1().Nodes().Informer(), store.Store.Nodes, false)
	setupInformer(factory.Core().V1().Namespaces().Informer(), store.Store.Namespaces, false)
	// setupInformer(factory.Apiextensions().V1().CustomResourceDefinitions().Informer(), store.Store.CRDs, false)
	setupInformer(factory.Core().V1().ServiceAccounts().Informer(), store.Store.ServiceAccounts, true)
	setupInformer(factory.Rbac().V1().Roles().Informer(), store.Store.Roles, true)
	setupInformer(factory.Rbac().V1().ClusterRoles().Informer(), store.Store.ClusterRoles, false)
	setupInformer(factory.Rbac().V1().RoleBindings().Informer(), store.Store.RoleBindings, true)
	setupInformer(factory.Rbac().V1().ClusterRoleBindings().Informer(), store.Store.ClusterRoleBindings, false)
	setupInformer(factory.Core().V1().Events().Informer(), store.Store.Events, true)

	factory.Start(stopCh)
	factory.WaitForCacheSync(stopCh)
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
