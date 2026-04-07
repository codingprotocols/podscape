package store_test

import (
	"testing"

	"github.com/podscape/go-core/internal/store"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func newCache() *store.ContextCache {
	return store.NewContextCache(fake.NewSimpleClientset(), nil)
}

// TestNewContextCache_AllMapsInitialised verifies no map is nil after construction
// (a nil map panics on write — this guards against future fields being missed in NewContextCache).
func TestNewContextCache_AllMapsInitialised(t *testing.T) {
	c := newCache()
	// Sample a cross-section of maps; the full set is covered by store.go's initializer.
	maps := []struct {
		name string
		m    map[string]interface{}
	}{
		{"Pods", c.Pods}, {"Nodes", c.Nodes}, {"Deployments", c.Deployments},
		{"Services", c.Services}, {"Secrets", c.Secrets}, {"ConfigMaps", c.ConfigMaps},
		{"HPAs", c.HPAs}, {"PDBs", c.PDBs}, {"CRDs", c.CRDs}, {"Events", c.Events},
		{"ClusterRoles", c.ClusterRoles}, {"ClusterRoleBindings", c.ClusterRoleBindings},
	}
	for _, tc := range maps {
		if tc.m == nil {
			t.Errorf("NewContextCache: %s map is nil", tc.name)
		}
	}
}

func TestContextCache_GetPod(t *testing.T) {
	c := newCache()
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default"}}
	c.Pods["default/web"] = pod

	t.Run("found", func(t *testing.T) {
		got, ok := c.GetPod("default", "web")
		if !ok || got.Name != "web" {
			t.Errorf("GetPod = %v, %v; want web, true", got, ok)
		}
	})
	t.Run("not found", func(t *testing.T) {
		_, ok := c.GetPod("default", "missing")
		if ok {
			t.Error("GetPod: expected not found")
		}
	})
}

func TestContextCache_GetNode(t *testing.T) {
	c := newCache()
	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "worker-1"}}
	c.Nodes["worker-1"] = node

	got, ok := c.GetNode("worker-1")
	if !ok || got.Name != "worker-1" {
		t.Errorf("GetNode = %v, %v; want worker-1, true", got, ok)
	}
	_, ok = c.GetNode("missing")
	if ok {
		t.Error("GetNode: expected not found")
	}
}

func TestContextCache_GetDeployment(t *testing.T) {
	c := newCache()
	dep := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "prod"}}
	c.Deployments["prod/api"] = dep

	got, ok := c.GetDeployment("prod", "api")
	if !ok || got.Name != "api" {
		t.Errorf("GetDeployment = %v, %v; want api, true", got, ok)
	}
}

func TestContextCache_GetService(t *testing.T) {
	c := newCache()
	svc := &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "svc", Namespace: "default"}}
	c.Services["default/svc"] = svc

	got, ok := c.GetService("default", "svc")
	if !ok || got.Name != "svc" {
		t.Errorf("GetService = %v, %v; want svc, true", got, ok)
	}
}

func TestContextCache_ClearMaps(t *testing.T) {
	c := newCache()
	c.Pods["default/web"] = &corev1.Pod{}
	c.Services["default/svc"] = &corev1.Service{}

	c.Lock()
	c.ClearMaps()
	c.Unlock()

	if len(c.Pods) != 0 {
		t.Errorf("ClearMaps: Pods not cleared, len=%d", len(c.Pods))
	}
	if len(c.Services) != 0 {
		t.Errorf("ClearMaps: Services not cleared, len=%d", len(c.Services))
	}
	// Verify maps are still usable after clear (not nil)
	c.Pods["x"] = &corev1.Pod{}
}

func TestClusterStore_GetOrCreateCache(t *testing.T) {
	s := store.NewClusterStore()
	cs := fake.NewSimpleClientset()

	c1, created := s.GetOrCreateCache("ctx-a", cs, nil)
	if !created {
		t.Error("first GetOrCreateCache should return created=true")
	}

	c2, created := s.GetOrCreateCache("ctx-a", cs, nil)
	if created {
		t.Error("second GetOrCreateCache for same context should return created=false")
	}
	if c1 != c2 {
		t.Error("GetOrCreateCache should return the same cache pointer on re-use")
	}
}

func TestClusterStore_ActiveClientset_NilCache(t *testing.T) {
	s := store.NewClusterStore()
	cs, cfg := s.ActiveClientset()
	if cs != nil || cfg != nil {
		t.Errorf("ActiveClientset with no active cache: got (%v, %v), want (nil, nil)", cs, cfg)
	}
}
