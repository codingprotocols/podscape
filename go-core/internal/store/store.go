package store

import (
	"sync"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apiextensionsclientset "k8s.io/apiextensions-apiserver/pkg/client/clientset/clientset"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// ContextCache holds all per-context state: clientset, REST config, informer
// stop channel, readiness flags, and the 28 resource maps.
type ContextCache struct {
	sync.RWMutex
	Clientset             kubernetes.Interface
	ApiextensionsClientset apiextensionsclientset.Interface
	Config                *rest.Config
	StopCh     chan struct{}
	CacheReady bool // true once critical informers have synced at least once for this cache
	HasData    bool // set true after first successful background sync; never reset to false
	//   false = never fully synced → use direct-API fallback
	//   true  = stale data ok → serve cache, restart informers in background

	// Resource maps
	Nodes               map[string]interface{}
	Pods                map[string]interface{}
	Deployments         map[string]interface{}
	DaemonSets          map[string]interface{}
	StatefulSets        map[string]interface{}
	ReplicaSets         map[string]interface{}
	Jobs                map[string]interface{}
	CronJobs            map[string]interface{}
	HPAs                map[string]interface{}
	PDBs                map[string]interface{}
	Services            map[string]interface{}
	Ingresses           map[string]interface{}
	IngressClasses      map[string]interface{}
	NetworkPolicies     map[string]interface{}
	Endpoints           map[string]interface{}
	ConfigMaps          map[string]interface{}
	Secrets             map[string]interface{}
	PVCs                map[string]interface{}
	PVs                 map[string]interface{}
	StorageClasses      map[string]interface{}
	Namespaces          map[string]interface{}
	CRDs                map[string]interface{}
	ServiceAccounts     map[string]interface{}
	Roles               map[string]interface{}
	ClusterRoles        map[string]interface{}
	RoleBindings        map[string]interface{}
	ClusterRoleBindings map[string]interface{}
	Events              map[string]interface{}
}

func NewContextCache(clientset kubernetes.Interface, config *rest.Config) *ContextCache {
	return &ContextCache{
		Clientset: clientset,
		Config:    config,
		StopCh:    make(chan struct{}),

		Nodes:               make(map[string]interface{}),
		Pods:                make(map[string]interface{}),
		Deployments:         make(map[string]interface{}),
		DaemonSets:          make(map[string]interface{}),
		StatefulSets:        make(map[string]interface{}),
		ReplicaSets:         make(map[string]interface{}),
		Jobs:                make(map[string]interface{}),
		CronJobs:            make(map[string]interface{}),
		HPAs:                make(map[string]interface{}),
		PDBs:                make(map[string]interface{}),
		Services:            make(map[string]interface{}),
		Ingresses:           make(map[string]interface{}),
		IngressClasses:      make(map[string]interface{}),
		NetworkPolicies:     make(map[string]interface{}),
		Endpoints:           make(map[string]interface{}),
		ConfigMaps:          make(map[string]interface{}),
		Secrets:             make(map[string]interface{}),
		PVCs:                make(map[string]interface{}),
		PVs:                 make(map[string]interface{}),
		StorageClasses:      make(map[string]interface{}),
		Namespaces:          make(map[string]interface{}),
		CRDs:                make(map[string]interface{}),
		ServiceAccounts:     make(map[string]interface{}),
		Roles:               make(map[string]interface{}),
		ClusterRoles:        make(map[string]interface{}),
		RoleBindings:        make(map[string]interface{}),
		ClusterRoleBindings: make(map[string]interface{}),
		Events:              make(map[string]interface{}),
	}
}

// Typed getters — callers must hold at least cache.RLock() before calling.

// GetPod returns the typed pod from the cache. Key is "namespace/name".
func (c *ContextCache) GetPod(namespace, name string) (*corev1.Pod, bool) {
	v, ok := c.Pods[namespace+"/"+name]
	if !ok {
		return nil, false
	}
	pod, ok := v.(*corev1.Pod)
	return pod, ok
}

// GetNode returns the typed node from the cache. Key is the node name.
func (c *ContextCache) GetNode(name string) (*corev1.Node, bool) {
	v, ok := c.Nodes[name]
	if !ok {
		return nil, false
	}
	node, ok := v.(*corev1.Node)
	return node, ok
}

// GetDeployment returns the typed deployment from the cache. Key is "namespace/name".
func (c *ContextCache) GetDeployment(namespace, name string) (*appsv1.Deployment, bool) {
	v, ok := c.Deployments[namespace+"/"+name]
	if !ok {
		return nil, false
	}
	dep, ok := v.(*appsv1.Deployment)
	return dep, ok
}

// GetService returns the typed service from the cache. Key is "namespace/name".
func (c *ContextCache) GetService(namespace, name string) (*corev1.Service, bool) {
	v, ok := c.Services[namespace+"/"+name]
	if !ok {
		return nil, false
	}
	svc, ok := v.(*corev1.Service)
	return svc, ok
}

// GetEvent returns the typed event from the cache. Key is "namespace/name".
func (c *ContextCache) GetEvent(namespace, name string) (*corev1.Event, bool) {
	v, ok := c.Events[namespace+"/"+name]
	if !ok {
		return nil, false
	}
	event, ok := v.(*corev1.Event)
	return event, ok
}

// ClearMaps resets all resource maps. Caller must hold cache.Lock().
func (c *ContextCache) ClearMaps() {
	c.Nodes = make(map[string]interface{})
	c.Pods = make(map[string]interface{})
	c.Deployments = make(map[string]interface{})
	c.DaemonSets = make(map[string]interface{})
	c.StatefulSets = make(map[string]interface{})
	c.ReplicaSets = make(map[string]interface{})
	c.Jobs = make(map[string]interface{})
	c.CronJobs = make(map[string]interface{})
	c.HPAs = make(map[string]interface{})
	c.PDBs = make(map[string]interface{})
	c.Services = make(map[string]interface{})
	c.Ingresses = make(map[string]interface{})
	c.IngressClasses = make(map[string]interface{})
	c.NetworkPolicies = make(map[string]interface{})
	c.Endpoints = make(map[string]interface{})
	c.ConfigMaps = make(map[string]interface{})
	c.Secrets = make(map[string]interface{})
	c.PVCs = make(map[string]interface{})
	c.PVs = make(map[string]interface{})
	c.StorageClasses = make(map[string]interface{})
	c.Namespaces = make(map[string]interface{})
	c.CRDs = make(map[string]interface{})
	c.ServiceAccounts = make(map[string]interface{})
	c.Roles = make(map[string]interface{})
	c.ClusterRoles = make(map[string]interface{})
	c.RoleBindings = make(map[string]interface{})
	c.ClusterRoleBindings = make(map[string]interface{})
	c.Events = make(map[string]interface{})
}

// ClusterStore is a thin coordinator that maintains the per-context cache pool
// and tracks the currently active context.
type ClusterStore struct {
	sync.RWMutex                       // guards ActiveCache pointer and caches map only
	Kubeconfig        string
	NoKubeconfig      bool   // true when sidecar started with no valid kubeconfig file
	ActiveContextName string
	ActiveCache       *ContextCache
	caches            map[string]*ContextCache
}

// GetOrCreateCache returns (existing cache, false) or (new cache, true).
// On re-use, Clientset and Config are refreshed in case credentials rotated.
// Caller must NOT hold s's lock.
func (s *ClusterStore) GetOrCreateCache(name string, cs kubernetes.Interface, cfg *rest.Config) (*ContextCache, bool) {
	s.Lock()
	defer s.Unlock()
	if c, ok := s.caches[name]; ok {
		c.Lock()
		c.Clientset = cs
		c.Config = cfg
		c.Unlock()
		return c, false
	}
	c := NewContextCache(cs, cfg)
	s.caches[name] = c
	return c, true
}

// ActiveClientset returns a snapshot of the active cache's clientset and config.
// Two-phase lock: s.RLock → ac.RLock. Caller must NOT hold either lock.
func (s *ClusterStore) ActiveClientset() (kubernetes.Interface, *rest.Config) {
	s.RLock()
	ac := s.ActiveCache
	s.RUnlock()
	if ac == nil {
		return nil, nil
	}
	ac.RLock()
	cs, cfg := ac.Clientset, ac.Config
	ac.RUnlock()
	return cs, cfg
}

var Store = &ClusterStore{caches: make(map[string]*ContextCache)}
