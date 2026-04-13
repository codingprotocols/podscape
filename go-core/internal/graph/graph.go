package graph

import (
	"fmt"
)

// NodeKind identifies the type of a Kubernetes resource.
type NodeKind string

const (
	KindPod           NodeKind = "pod"
	KindService       NodeKind = "service"
	KindDeployment    NodeKind = "workload"
	KindReplicaSet    NodeKind = "workload"
	KindDaemonSet     NodeKind = "workload"
	KindStatefulSet   NodeKind = "workload"
	KindJob           NodeKind = "workload"
	KindCronJob       NodeKind = "workload"
	KindIngress       NodeKind = "ingress"
	KindPVC           NodeKind = "pvc"
	KindConfigMap     NodeKind = "configmap"
	KindSecret        NodeKind = "secret"
	KindNode          NodeKind = "node"
	KindNetworkPolicy NodeKind = "policy"
	KindWorkload      NodeKind = "workload"
)

// Node represents a vertex in the Kubernetes resource graph.
type Node struct {
	ID           string            `json:"id"`
	Kind         NodeKind          `json:"kind"`
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Labels       map[string]string `json:"labels,omitempty"`
	UID          string            `json:"uid,omitempty"`
	Phase        string            `json:"phase,omitempty"`        // for pods/pvcs
	ServiceType  string            `json:"serviceType,omitempty"`  // for services
	Ports        []string          `json:"ports,omitempty"`        // for services
	WorkloadKind string            `json:"workloadKind,omitempty"` // for workloads
	OwnerUID     string            `json:"ownerUid,omitempty"`     // for collapsing
	ReplicaCount int               `json:"replicaCount,omitempty"`
	ReplicaNames []string          `json:"replicaNames,omitempty"`
}

// EdgeKind identifies the type of relationship between two resources.
type EdgeKind string

const (
	EdgeOwner             EdgeKind = "controller-pod"
	EdgeControllerWorkload EdgeKind = "controller-workload"
	EdgeSelector          EdgeKind = "svc-pod"
	EdgeVolume            EdgeKind = "pod-pvc"
	EdgeConnection        EdgeKind = "ing-svc"
	EdgePolicy            EdgeKind = "policy-pod"
	EdgePodNode           EdgeKind = "pod-node"
)

// Edge represents a directed relationship between two nodes.
type Edge struct {
	ID     string   `json:"id"`
	Source string   `json:"source"`
	Target string   `json:"target"`
	Kind   EdgeKind `json:"kind"`
	Label  string   `json:"label,omitempty"`
}

// Graph represents the entire collection of discovered resources and relationships.
type Graph struct {
	Nodes      []Node   `json:"nodes"`
	Edges      []Edge   `json:"edges"`
	Namespaces []string `json:"namespaces"`
}

// Discoverer is the interface for components that can find relationships in the graph.
type Discoverer interface {
	Name() string
	Discover(nodes []Node, cache ResourceCache) []Edge
}

// ResourceCache provides access to the underlying K8s objects for deep inspection.
// This abstraction allows the discovery engine to work with different data sources.
type ResourceCache interface {
	GetRawObject(kind NodeKind, namespace, name string) (interface{}, bool)
}

// NewNode creates a standard node ID from its components.
func (n *Node) ComputeID() string {
	kind := NormalizeKind(string(n.Kind))
	if n.UID != "" {
		return fmt.Sprintf("%s:%s", kind, n.UID)
	}
	return fmt.Sprintf("%s:%s:%s", kind, n.Namespace, n.Name)
}

// NormalizeKind converts a K8s Kind string to our internal NodeKind.
func NormalizeKind(kind string) NodeKind {
	switch kind {
	case "Pod", "pod":
		return KindPod
	case "Service", "service":
		return KindService
	case "Deployment", "deployment":
		return KindDeployment
	case "ReplicaSet", "replicaset":
		return KindReplicaSet
	case "DaemonSet", "daemonset":
		return KindDaemonSet
	case "StatefulSet", "statefulset":
		return KindStatefulSet
	case "Job", "job":
		return KindJob
	case "CronJob", "cronjob":
		return KindCronJob
	case "Ingress", "ingress":
		return KindIngress
	case "PersistentVolumeClaim", "pvc":
		return KindPVC
	case "ConfigMap", "configmap":
		return KindConfigMap
	case "Secret", "secret":
		return KindSecret
	case "Node", "node":
		return KindNode
	case "NetworkPolicy", "networkpolicy":
		return KindNetworkPolicy
	default:
		return NodeKind(kind)
	}
}
