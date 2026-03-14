package store

import (
	"sync"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type ClusterStore struct {
	sync.RWMutex
	Config          *rest.Config
	Clientset       *kubernetes.Clientset
	Kubeconfig      string
	InformerStopCh  chan struct{}
	CacheReady      bool
	Nodes           map[string]interface{}
	Pods        map[string]interface{}
	Deployments map[string]interface{}

	// Workloads
	DaemonSets   map[string]interface{}
	StatefulSets map[string]interface{}
	ReplicaSets  map[string]interface{}
	Jobs         map[string]interface{}
	CronJobs     map[string]interface{}
	HPAs         map[string]interface{}
	PDBs         map[string]interface{}

	// Networking
	Services        map[string]interface{}
	Ingresses       map[string]interface{}
	IngressClasses  map[string]interface{}
	NetworkPolicies map[string]interface{}
	Endpoints       map[string]interface{}

	// Config & Storage
	ConfigMaps     map[string]interface{}
	Secrets        map[string]interface{}
	PVCs           map[string]interface{}
	PVs            map[string]interface{}
	StorageClasses map[string]interface{}

	// Cluster & RBAC
	Namespaces          map[string]interface{}
	CRDs                map[string]interface{}
	ServiceAccounts     map[string]interface{}
	Roles               map[string]interface{}
	ClusterRoles        map[string]interface{}
	RoleBindings        map[string]interface{}
	ClusterRoleBindings map[string]interface{}
	Events              map[string]interface{}
}

func NewClusterStore() *ClusterStore {
	return &ClusterStore{
		Nodes:       make(map[string]interface{}),
		Pods:        make(map[string]interface{}),
		Deployments: make(map[string]interface{}),

		DaemonSets:   make(map[string]interface{}),
		StatefulSets: make(map[string]interface{}),
		ReplicaSets:  make(map[string]interface{}),
		Jobs:         make(map[string]interface{}),
		CronJobs:     make(map[string]interface{}),
		HPAs:         make(map[string]interface{}),
		PDBs:         make(map[string]interface{}),

		Services:        make(map[string]interface{}),
		Ingresses:       make(map[string]interface{}),
		IngressClasses:  make(map[string]interface{}),
		NetworkPolicies: make(map[string]interface{}),
		Endpoints:       make(map[string]interface{}),

		ConfigMaps:     make(map[string]interface{}),
		Secrets:        make(map[string]interface{}),
		PVCs:           make(map[string]interface{}),
		PVs:            make(map[string]interface{}),
		StorageClasses: make(map[string]interface{}),

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

var Store = NewClusterStore()

// ClearMaps resets all resource maps. Caller must hold Store.Lock().
func (s *ClusterStore) ClearMaps() {
	s.Nodes = make(map[string]interface{})
	s.Pods = make(map[string]interface{})
	s.Deployments = make(map[string]interface{})
	s.DaemonSets = make(map[string]interface{})
	s.StatefulSets = make(map[string]interface{})
	s.ReplicaSets = make(map[string]interface{})
	s.Jobs = make(map[string]interface{})
	s.CronJobs = make(map[string]interface{})
	s.HPAs = make(map[string]interface{})
	s.PDBs = make(map[string]interface{})
	s.Services = make(map[string]interface{})
	s.Ingresses = make(map[string]interface{})
	s.IngressClasses = make(map[string]interface{})
	s.NetworkPolicies = make(map[string]interface{})
	s.Endpoints = make(map[string]interface{})
	s.ConfigMaps = make(map[string]interface{})
	s.Secrets = make(map[string]interface{})
	s.PVCs = make(map[string]interface{})
	s.PVs = make(map[string]interface{})
	s.StorageClasses = make(map[string]interface{})
	s.Namespaces = make(map[string]interface{})
	s.CRDs = make(map[string]interface{})
	s.ServiceAccounts = make(map[string]interface{})
	s.Roles = make(map[string]interface{})
	s.ClusterRoles = make(map[string]interface{})
	s.RoleBindings = make(map[string]interface{})
	s.ClusterRoleBindings = make(map[string]interface{})
	s.Events = make(map[string]interface{})
}
