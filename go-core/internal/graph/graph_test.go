package graph

import (
	"fmt"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

// mockCache implements ResourceCache for testing.
type mockCache struct {
	objects map[string]interface{}
}

func (m *mockCache) GetRawObject(kind NodeKind, namespace, name string) (interface{}, bool) {
	key := fmt.Sprintf("%s:%s:%s", kind, namespace, name)
	obj, ok := m.objects[key]
	return obj, ok
}

func TestGraphDiscovery(t *testing.T) {
	// 1. Setup Mock Data
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-pod",
			Namespace: "default",
			UID:       "pod-123",
			Labels:    map[string]string{"app": "web"},
		},
		Spec: corev1.PodSpec{
			Volumes: []corev1.Volume{
				{
					Name: "data",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: "test-pvc",
						},
					},
				},
			},
		},
	}

	svc := &corev1.Service{
		TypeMeta: metav1.TypeMeta{
			Kind: "Service",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-svc",
			Namespace: "default",
			UID:       "svc-456",
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "web"},
		},
	}

	cache := &mockCache{
		objects: map[string]interface{}{
			"pod:default:test-pod": pod,
			"service:default:test-svc": svc,
		},
	}

	// 2. Define Initial Nodes
	nodes := []Node{
		{ID: "pod:pod-123", Kind: KindPod, Name: "test-pod", Namespace: "default", Labels: map[string]string{"app": "web"}, UID: "pod-123"},
		{ID: "service:svc-456", Kind: KindService, Name: "test-svc", Namespace: "default", UID: "svc-456"},
	}

	// 3. Build Graph
	builder := NewGraphBuilder(cache)
	graph := builder.Build(nodes)

	// 4. Verify Edges
	foundSelector := false
	foundVolume := false

	for _, edge := range graph.Edges {
		if edge.Kind == EdgeSelector && edge.Source == "service:svc-456" && edge.Target == "pod:pod-123" {
			foundSelector = true
		}
		if edge.Kind == EdgeVolume && edge.Source == "pod:pod-123" && edge.Target == "pvc:default:test-pvc" {
			foundVolume = true
		}
	}

	if !foundSelector {
		t.Errorf("expected to find selector edge from service to pod")
	}
	if !foundVolume {
		t.Errorf("expected to find volume edge from pod to pvc")
	}
}

func TestDeepOwnerChain(t *testing.T) {
	// 1. Setup Mock Data (Deployment -> RS -> Pod)
	deploy := &appsv1.Deployment{
		TypeMeta: metav1.TypeMeta{Kind: "Deployment"},
		ObjectMeta: metav1.ObjectMeta{Name: "web-deploy", Namespace: "prod", UID: "deploy-1"},
	}
	rs := &appsv1.ReplicaSet{
		TypeMeta: metav1.TypeMeta{Kind: "ReplicaSet"},
		ObjectMeta: metav1.ObjectMeta{
			Name: "web-rs", Namespace: "prod", UID: "rs-1",
			OwnerReferences: []metav1.OwnerReference{
				{Kind: "Deployment", Name: "web-deploy", UID: "deploy-1"},
			},
		},
	}
	pod := &corev1.Pod{
		TypeMeta: metav1.TypeMeta{Kind: "Pod"},
		ObjectMeta: metav1.ObjectMeta{
			Name: "web-pod", Namespace: "prod", UID: "pod-1",
			OwnerReferences: []metav1.OwnerReference{
				{Kind: "ReplicaSet", Name: "web-rs", UID: "rs-1"},
			},
		},
	}

	cache := &mockCache{
		objects: map[string]interface{}{
			"workload:prod:web-deploy": deploy,
			"workload:prod:web-rs":     rs,
			"pod:prod:web-pod":         pod,
		},
	}

	// 2. Define Initial Nodes
	nodes := []Node{
		{ID: "workload:deploy-1", Kind: KindDeployment, Name: "web-deploy", Namespace: "prod", UID: "deploy-1"},
		{ID: "workload:rs-1", Kind: KindReplicaSet, Name: "web-rs", Namespace: "prod", UID: "rs-1"},
		{ID: "pod:pod-1", Kind: KindPod, Name: "web-pod", Namespace: "prod", UID: "pod-1"},
	}

	// 3. Build Graph
	builder := NewGraphBuilder(cache)
	graph := builder.Build(nodes)

	// 4. Verify Edges
	foundDeployRS := false
	foundRSPod := false

	for _, edge := range graph.Edges {
		if edge.Kind == EdgeOwner && edge.Source == "workload:deploy-1" && edge.Target == "workload:rs-1" {
			foundDeployRS = true
		}
		if edge.Kind == EdgeOwner && edge.Source == "workload:rs-1" && edge.Target == "pod:pod-1" {
			foundRSPod = true
		}
	}

	if !foundDeployRS {
		t.Errorf("expected to find owner edge from deployment to RS")
	}
	if !foundRSPod {
		t.Errorf("expected to find owner edge from RS to pod")
	}
}
func TestConnectivityDiscovery(t *testing.T) {
	mock := &mockCache{
		objects: make(map[string]interface{}),
	}

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "ns", UID: "pod-uid"},
		Spec:       corev1.PodSpec{NodeName: "node-1"},
	}
	ing := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{Name: "ing-1", Namespace: "ns"},
		Spec: networkingv1.IngressSpec{
			Rules: []networkingv1.IngressRule{
				{
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: []networkingv1.HTTPIngressPath{
								{
									Backend: networkingv1.IngressBackend{
										Service: &networkingv1.IngressServiceBackend{
											Name: "svc-1",
											Port: networkingv1.ServiceBackendPort{Number: 80},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	mock.objects["pod:ns:pod-1"] = pod
	mock.objects["ingress:ns:ing-1"] = ing

	nodes := []Node{
		{ID: "pod:pod-uid", Kind: KindPod, Name: "pod-1", Namespace: "ns"},
		{ID: "node:node-1", Kind: KindNode, Name: "node-1"},
		{ID: "ingress:ns:ing-1", Kind: KindIngress, Name: "ing-1", Namespace: "ns"},
		{ID: "service:ns:svc-1", Kind: KindService, Name: "svc-1", Namespace: "ns"},
	}

	builder := NewGraphBuilder(mock)
	g := builder.Build(nodes)

	// Check Pod -> Node
	foundNodeEdge := false
	for _, e := range g.Edges {
		if e.Source == "pod:pod-uid" && e.Target == "node:node-1" {
			foundNodeEdge = true
			break
		}
	}
	if !foundNodeEdge {
		t.Errorf("did not find pod-to-node edge")
	}

	// Check Ingress -> Service
	foundIngSvc := false
	for _, e := range g.Edges {
		if e.Source == "ingress:ns:ing-1" && e.Target == "service:ns:svc-1" {
			foundIngSvc = true
			if e.Label != ":80" {
				t.Errorf("expected label :80, got %s", e.Label)
			}
			break
		}
	}
	if !foundIngSvc {
		t.Errorf("did not find ingress-to-service edge")
	}
}
func TestResourceCollapsing(t *testing.T) {
	cache := &mockCache{objects: make(map[string]interface{})}
	builder := NewGraphBuilder(cache)
	builder.AddDiscoverer(&ConnectionDiscoverer{})

	ownerUID := "owner-456"
	initialNodes := []Node{
		{ID: "pod-1", Kind: KindPod, Name: "web-v1-abc", Namespace: "default", OwnerUID: ownerUID, Labels: map[string]string{"app": "web"}},
		{ID: "pod-2", Kind: KindPod, Name: "web-v1-def", Namespace: "default", OwnerUID: ownerUID, Labels: map[string]string{"app": "web"}},
		{ID: "pod-3", Kind: KindPod, Name: "web-v1-ghi", Namespace: "default", OwnerUID: ownerUID, Labels: map[string]string{"app": "web"}},
		{ID: "service:default:web", Kind: KindService, Name: "web-svc", Namespace: "default", Labels: map[string]string{"app": "web"}},
	}

	// Mock Service for ConnectionDiscoverer
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "web-svc", Namespace: "default", Labels: map[string]string{"app": "web"}},
		Spec:       corev1.ServiceSpec{Selector: map[string]string{"app": "web"}},
	}
	cache.objects[fmt.Sprintf("%s:%s:%s", KindService, "default", "web-svc")] = svc

	graph := builder.Build(initialNodes)

	// Expected: 1 Service Node + 1 Collapsed Pod Node = 2 Nodes
	if len(graph.Nodes) != 2 {
		t.Errorf("expected 2 nodes after collapsing, got %d", len(graph.Nodes))
	}

	var podNode *Node
	for i := range graph.Nodes {
		if graph.Nodes[i].Kind == KindPod {
			podNode = &graph.Nodes[i]
		}
	}

	if podNode == nil {
		t.Fatal("collapsed pod node not found")
	}

	if podNode.ReplicaCount != 3 {
		t.Errorf("expected replica count 3, got %d", podNode.ReplicaCount)
	}

	if len(podNode.ReplicaNames) != 3 {
		t.Errorf("expected 3 replica names, got %d", len(podNode.ReplicaNames))
	}

	// Expected: 1 Edge from Service to Collapsed Pod
	if len(graph.Edges) != 1 {
		t.Errorf("expected 1 edge after collapsing, got %d", len(graph.Edges))
	}

	if graph.Edges[0].Target != podNode.ID {
		t.Errorf("expected edge target to be %s, got %s", podNode.ID, graph.Edges[0].Target)
	}
}
func TestNetworkPolicy(t *testing.T) {
	cache := &mockCache{objects: make(map[string]interface{})}
	builder := NewGraphBuilder(cache)
	builder.AddDiscoverer(&NetworkPolicyDiscoverer{})

	// 1. Setup Pod and Policy
	podUID := "pod-polar"
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "secure-pod", Namespace: "prod", UID: types.UID(podUID),
			Labels: map[string]string{"tier": "db"},
		},
	}
	
	policyUID := "policy-main"
	policy := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: "db-policy", Namespace: "prod", UID: types.UID(policyUID)},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{
				MatchLabels: map[string]string{"tier": "db"},
			},
		},
	}

	cache.objects["pod:prod:secure-pod"] = pod
	cache.objects["networkpolicy:prod:db-policy"] = policy

	nodes := []Node{
		{ID: "pod:" + podUID, Kind: KindPod, Name: "secure-pod", Namespace: "prod", Labels: map[string]string{"tier": "db"}, UID: podUID},
		{ID: "policy:" + policyUID, Kind: KindNetworkPolicy, Name: "db-policy", Namespace: "prod", UID: policyUID},
	}

	// 2. Build Graph
	graph := builder.Build(nodes)

	// 3. Verify Edge
	found := false
	for _, edge := range graph.Edges {
		if edge.Kind == EdgePolicy && edge.Source == "networkpolicy:"+policyUID && edge.Target == "pod:"+podUID {
			found = true
			break
		}
	}

	if !found {
		t.Errorf("expected to find policy edge from policy to pod")
	}
}
