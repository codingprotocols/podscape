package topology_test

import (
	"testing"

	"github.com/podscape/go-core/internal/store"
	"github.com/podscape/go-core/internal/topology"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
)

func emptyCache() *store.ContextCache {
	return store.NewContextCache(fake.NewSimpleClientset(), nil)
}

func findNode(nodes []topology.TopologyNode, id string) *topology.TopologyNode {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
	}
	return nil
}

func hasEdge(edges []topology.TopologyEdge, src, tgt string, kind topology.EdgeKind) bool {
	for _, e := range edges {
		if e.Source == src && e.Target == tgt && e.Kind == kind {
			return true
		}
	}
	return false
}

func TestBuildTopology_EmptyCache(t *testing.T) {
	topo := topology.BuildTopology("", emptyCache())
	if len(topo.Nodes) != 0 {
		t.Errorf("empty cache: want 0 nodes, got %d", len(topo.Nodes))
	}
	if len(topo.Edges) != 0 {
		t.Errorf("empty cache: want 0 edges, got %d", len(topo.Edges))
	}
}

func TestBuildTopology_PodToNodeEdge(t *testing.T) {
	c := emptyCache()
	c.Nodes["worker-1"] = &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "worker-1"}}
	c.Pods["default/web"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default", UID: "pod-uid-1"},
		Spec:       corev1.PodSpec{NodeName: "worker-1"},
	}

	topo := topology.BuildTopology("", c)

	if !hasEdge(topo.Edges, "pod:pod-uid-1", "node:worker-1", topology.EdgePodNode) {
		t.Error("expected pod→node edge")
	}
}

func TestBuildTopology_ServiceToPodEdge(t *testing.T) {
	c := emptyCache()
	c.Services["default/svc"] = &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc", Namespace: "default"},
		Spec:       corev1.ServiceSpec{Selector: map[string]string{"app": "web"}},
	}
	c.Pods["default/web"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "web", Namespace: "default", UID: "pod-uid-1",
			Labels: map[string]string{"app": "web"},
		},
	}

	topo := topology.BuildTopology("", c)

	if !hasEdge(topo.Edges, "svc:default:svc", "pod:pod-uid-1", topology.EdgeSvcPod) {
		t.Error("expected service→pod edge via label selector")
	}
}

func TestBuildTopology_ServicePodNoMatch(t *testing.T) {
	c := emptyCache()
	c.Services["default/svc"] = &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc", Namespace: "default"},
		Spec:       corev1.ServiceSpec{Selector: map[string]string{"app": "api"}},
	}
	c.Pods["default/web"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "web", Namespace: "default", UID: "pod-uid-1",
			Labels: map[string]string{"app": "web"},
		},
	}

	topo := topology.BuildTopology("", c)
	if hasEdge(topo.Edges, "svc:default:svc", "pod:pod-uid-1", topology.EdgeSvcPod) {
		t.Error("label mismatch: svc→pod edge should not exist")
	}
}

func TestBuildTopology_IngressToServiceEdge(t *testing.T) {
	c := emptyCache()
	port := networkingv1.ServiceBackendPort{Number: 80}
	c.Ingresses["default/ing"] = &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{Name: "ing", Namespace: "default"},
		Spec: networkingv1.IngressSpec{
			Rules: []networkingv1.IngressRule{{
				IngressRuleValue: networkingv1.IngressRuleValue{
					HTTP: &networkingv1.HTTPIngressRuleValue{
						Paths: []networkingv1.HTTPIngressPath{{
							Backend: networkingv1.IngressBackend{
								Service: &networkingv1.IngressServiceBackend{
									Name: "svc",
									Port: port,
								},
							},
						}},
					},
				},
			}},
		},
	}

	topo := topology.BuildTopology("", c)
	if !hasEdge(topo.Edges, "ing:default:ing", "svc:default:svc", topology.EdgeIngSvc) {
		t.Error("expected ingress→service edge")
	}
}

func TestBuildTopology_PodToPVCEdge(t *testing.T) {
	c := emptyCache()
	c.Pods["default/web"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default", UID: "pod-uid-1"},
		Spec: corev1.PodSpec{
			Volumes: []corev1.Volume{{
				VolumeSource: corev1.VolumeSource{
					PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "data"},
				},
			}},
		},
	}

	topo := topology.BuildTopology("", c)
	if !hasEdge(topo.Edges, "pod:pod-uid-1", "pvc:default:data", topology.EdgePodPVC) {
		t.Error("expected pod→pvc edge")
	}
}

func TestBuildTopology_WorkloadToPodEdge(t *testing.T) {
	c := emptyCache()
	depUID := types.UID("dep-uid")
	c.Deployments["default/api"] = &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "default", UID: depUID},
	}
	c.Pods["default/api-pod"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "api-pod", Namespace: "default", UID: "pod-uid-1",
			OwnerReferences: []metav1.OwnerReference{{Kind: "Deployment", Name: "api"}},
		},
	}

	topo := topology.BuildTopology("", c)
	if !hasEdge(topo.Edges, "workload:default:Deployment:api", "pod:pod-uid-1", topology.EdgeControllerPod) {
		t.Error("expected workload→pod edge via owner reference")
	}
}

func TestBuildTopology_NamespaceFilter(t *testing.T) {
	c := emptyCache()
	c.Pods["ns-a/pod-a"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-a", Namespace: "ns-a", UID: "uid-a"},
	}
	c.Pods["ns-b/pod-b"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-b", Namespace: "ns-b", UID: "uid-b"},
	}

	topo := topology.BuildTopology("ns-a", c)

	if findNode(topo.Nodes, "pod:uid-a") == nil {
		t.Error("pod-a in ns-a should be included")
	}
	if findNode(topo.Nodes, "pod:uid-b") != nil {
		t.Error("pod-b in ns-b should be excluded by namespace filter")
	}
}

func TestBuildTopology_DuplicateEdgeDeduplication(t *testing.T) {
	c := emptyCache()
	selector := map[string]string{"app": "web"}
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc", Namespace: "default"},
		Spec:       corev1.ServiceSpec{Selector: selector},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "web", Namespace: "default", UID: "pod-uid-1",
			Labels: selector,
		},
	}
	c.Services["default/svc"] = svc
	c.Pods["default/web"] = pod

	// Build twice — duplicate prevention is internal, but we verify only one edge exists.
	topo := topology.BuildTopology("", c)

	count := 0
	for _, e := range topo.Edges {
		if e.Source == "svc:default:svc" && e.Target == "pod:pod-uid-1" && e.Kind == topology.EdgeSvcPod {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected exactly 1 svc→pod edge, got %d", count)
	}
}

func TestBuildTopology_NamespacesCollected(t *testing.T) {
	c := emptyCache()
	c.Pods["ns-a/pod"] = &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod", Namespace: "ns-a", UID: "uid-1"},
	}
	c.Services["ns-b/svc"] = &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc", Namespace: "ns-b"},
	}

	topo := topology.BuildTopology("", c)

	nsSet := make(map[string]bool)
	for _, ns := range topo.Namespaces {
		nsSet[ns] = true
	}
	if !nsSet["ns-a"] {
		t.Error("ns-a should be in Namespaces")
	}
	if !nsSet["ns-b"] {
		t.Error("ns-b should be in Namespaces")
	}
}
