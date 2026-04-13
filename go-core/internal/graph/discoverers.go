package graph

import (
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// OwnerDiscoverer finds relationships based on OwnerReferences.
type OwnerDiscoverer struct{}

func (d *OwnerDiscoverer) Name() string { return "OwnerDiscoverer" }

func (d *OwnerDiscoverer) Discover(nodes []Node, cache ResourceCache) []Edge {
	var edges []Edge
	for _, node := range nodes {
		obj, ok := cache.GetRawObject(node.Kind, node.Namespace, node.Name)
		if !ok {
			continue
		}

		metadata, ok := getObjectMetadata(obj)
		if !ok {
			continue
		}

		for _, ownerRef := range metadata.GetOwnerReferences() {
			ownerKind := NormalizeKind(ownerRef.Kind)
			
			targetID := node.ComputeID()
			sourceID := fmt.Sprintf("%s:%s:%s", ownerKind, node.Namespace, ownerRef.Name)
			if ownerRef.UID != "" {
				sourceID = fmt.Sprintf("%s:%s", ownerKind, ownerRef.UID)
			}

			kind := EdgeOwner
			if node.Kind != KindPod {
				kind = EdgeControllerWorkload
			}

			edges = append(edges, Edge{
				ID:     fmt.Sprintf("owner:%s->%s", sourceID, targetID),
				Source: sourceID,
				Target: targetID,
				Kind:   kind,
			})
		}
	}
	return edges
}

// SelectorDiscoverer finds relationships between Services and Pods.
type SelectorDiscoverer struct{}

func (d *SelectorDiscoverer) Name() string { return "SelectorDiscoverer" }

func (d *SelectorDiscoverer) Discover(nodes []Node, cache ResourceCache) []Edge {
	var edges []Edge
	
	// Index pods by namespace for faster matching
	podsByNS := make(map[string][]Node)
	for _, n := range nodes {
		if n.Kind == KindPod {
			podsByNS[n.Namespace] = append(podsByNS[n.Namespace], n)
		}
	}

	for _, node := range nodes {
		if node.Kind != KindService {
			continue
		}

		obj, ok := cache.GetRawObject(node.Kind, node.Namespace, node.Name)
		if !ok {
			continue
		}

		svc, ok := obj.(*corev1.Service)
		if !ok || svc.Spec.Selector == nil {
			continue
		}

		// Match against pods in the same namespace
		for _, pod := range podsByNS[node.Namespace] {
			if matchSelector(svc.Spec.Selector, pod.Labels) {
				edges = append(edges, Edge{
					ID:     fmt.Sprintf("selector:%s->%s", node.ComputeID(), pod.ComputeID()),
					Source: node.ComputeID(),
					Target: pod.ComputeID(),
					Kind:   EdgeSelector,
				})
			}
		}
	}
	return edges
}

// VolumeDiscoverer finds relationships between Pods and PVCs.
type VolumeDiscoverer struct{}

func (d *VolumeDiscoverer) Name() string { return "VolumeDiscoverer" }

func (d *VolumeDiscoverer) Discover(nodes []Node, cache ResourceCache) []Edge {
	var edges []Edge
	for _, node := range nodes {
		if node.Kind != KindPod {
			continue
		}

		obj, ok := cache.GetRawObject(node.Kind, node.Namespace, node.Name)
		if !ok {
			continue
		}

		pod, ok := obj.(*corev1.Pod)
		if !ok {
			continue
		}

		for _, vol := range pod.Spec.Volumes {
			if vol.PersistentVolumeClaim != nil {
				pvcID := fmt.Sprintf("%s:%s:%s", KindPVC, node.Namespace, vol.PersistentVolumeClaim.ClaimName)
				edges = append(edges, Edge{
					ID:     fmt.Sprintf("volume:%s->%s", node.ComputeID(), pvcID),
					Source: node.ComputeID(),
					Target: pvcID,
					Kind:   EdgeVolume,
					Label:  vol.Name,
				})
			}
		}
	}
	return edges
}

// NodeDiscoverer links Pods to the Nodes they are scheduled on.
type NodeDiscoverer struct{}

func (d *NodeDiscoverer) Name() string { return "NodeDiscoverer" }

func (d *NodeDiscoverer) Discover(nodes []Node, cache ResourceCache) []Edge {
	var edges []Edge
	for _, node := range nodes {
		if node.Kind != KindPod {
			continue
		}
		obj, ok := cache.GetRawObject(node.Kind, node.Namespace, node.Name)
		if !ok {
			continue
		}
		pod, ok := obj.(*corev1.Pod)
		if !ok || pod.Spec.NodeName == "" {
			continue
		}

		nodeID := fmt.Sprintf("node:%s", pod.Spec.NodeName)
		edges = append(edges, Edge{
			ID:     fmt.Sprintf("node:%s->%s", node.ComputeID(), nodeID),
			Source: node.ComputeID(),
			Target: nodeID,
			Kind:   EdgePodNode,
		})
	}
	return edges
}

// ConnectionDiscoverer links Ingresses to their backend Services.
type ConnectionDiscoverer struct{}

func (d *ConnectionDiscoverer) Name() string { return "ConnectionDiscoverer" }

func (d *ConnectionDiscoverer) Discover(nodes []Node, cache ResourceCache) []Edge {
	var edges []Edge
	for _, node := range nodes {
		if node.Kind != KindIngress {
			continue
		}
		obj, ok := cache.GetRawObject(node.Kind, node.Namespace, node.Name)
		if !ok {
			continue
		}

		ingV1, ok := obj.(*networkingv1.Ingress)
		if !ok {
			continue
		}

		for _, rule := range ingV1.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service != nil {
					// Backend might be referenced by name or UID in more complex scenarios, 
					// but standard ingress uses Service Name in the same namespace.
					// We'll try to find the service UID from the nodes list if possible for a better ID.
					svcName := path.Backend.Service.Name
					var svcUID string
					for _, n := range nodes {
						if n.Kind == KindService && n.Name == svcName && n.Namespace == node.Namespace {
							svcUID = n.UID
							break
						}
					}

					svcID := fmt.Sprintf("service:%s:%s", node.Namespace, svcName)
					if svcUID != "" {
						svcID = fmt.Sprintf("service:%s", svcUID)
					}

					label := ""
					if path.Backend.Service.Port.Number > 0 {
						label = fmt.Sprintf(":%d", path.Backend.Service.Port.Number)
					} else if path.Backend.Service.Port.Name != "" {
						label = ":" + path.Backend.Service.Port.Name
					}

					edges = append(edges, Edge{
						ID:     fmt.Sprintf("connection:%s->%s", node.ComputeID(), svcID),
						Source: node.ComputeID(),
						Target: svcID,
						Kind:   EdgeConnection,
						Label:  label,
					})
				}
			}
		}
	}
	return edges
}

// NetworkPolicyDiscoverer links NetworkPolicies to the Pods they govern.
type NetworkPolicyDiscoverer struct{}

func (d *NetworkPolicyDiscoverer) Name() string { return "NetworkPolicyDiscoverer" }

func (d *NetworkPolicyDiscoverer) Discover(nodes []Node, cache ResourceCache) []Edge {
	var edges []Edge

	podsByNS := make(map[string][]Node)
	for _, n := range nodes {
		if n.Kind == KindPod {
			podsByNS[n.Namespace] = append(podsByNS[n.Namespace], n)
		}
	}

	for _, node := range nodes {
		if node.Kind != KindNetworkPolicy {
			continue
		}

		obj, ok := cache.GetRawObject(node.Kind, node.Namespace, node.Name)
		if !ok {
			continue
		}

		np, ok := obj.(*networkingv1.NetworkPolicy)
		if !ok {
			continue
		}

		// Match pods in the same namespace
		for _, pod := range podsByNS[node.Namespace] {
			if matchSelector(np.Spec.PodSelector.MatchLabels, pod.Labels) {
				edges = append(edges, Edge{
					ID:     fmt.Sprintf("policy:%s->%s", node.ComputeID(), pod.ComputeID()),
					Source: node.ComputeID(),
					Target: pod.ComputeID(),
					Kind:   EdgePolicy,
				})
			}
		}
	}
	return edges
}

// Helper: matchSelector checks if a selector matches a set of labels.
func matchSelector(selector map[string]string, labels map[string]string) bool {
	if len(selector) == 0 {
		return false
	}
	for k, v := range selector {
		if labels[k] != v {
			return false
		}
	}
	return true
}

// Helper: getObjectMetadata extracts Kubernetes object metadata using type assertion.
func getObjectMetadata(obj interface{}) (metav1.Object, bool) {
	if m, ok := obj.(metav1.Object); ok {
		return m, true
	}
	// Handle cases where the object might be a pointer or wrapped
	switch t := obj.(type) {
	case *corev1.Pod:
		return t, true
	case *corev1.Service:
		return t, true
	case *appsv1.Deployment:
		return t, true
	case *appsv1.ReplicaSet:
		return t, true
	case *appsv1.StatefulSet:
		return t, true
	case *appsv1.DaemonSet:
		return t, true
	}
	return nil, false
}
