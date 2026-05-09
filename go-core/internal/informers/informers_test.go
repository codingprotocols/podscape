package informers

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sinformers "k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"

	"github.com/podscape/go-core/internal/store"
)

// ── rbacAllowed unit tests ────────────────────────────────────────────────────

func TestRbacAllowed_NilMap_Permissive(t *testing.T) {
	if !rbacAllowed(nil, "pods") {
		t.Error("nil allowed map should be permissive (RBAC probe has not run)")
	}
}

func TestRbacAllowed_ExplicitTrue_Allowed(t *testing.T) {
	m := map[string]bool{"pods": true}
	if !rbacAllowed(m, "pods") {
		t.Error("allowed[pods]=true should return true")
	}
}

func TestRbacAllowed_ExplicitFalse_Denied(t *testing.T) {
	m := map[string]bool{"pods": false}
	if rbacAllowed(m, "pods") {
		t.Error("allowed[pods]=false should return false")
	}
}

func TestRbacAllowed_MissingKey_Denied(t *testing.T) {
	// Go map zero-value for missing bool key is false — same semantics as explicit deny.
	m := map[string]bool{"nodes": true}
	if rbacAllowed(m, "pods") {
		t.Error("missing key in non-nil allowed map should return false")
	}
}

// ── registerCriticalInformers integration test ────────────────────────────────

// TestRegisterCriticalInformers_SkipsDeniedResource verifies that when
// AllowedResources denies a resource, registerCriticalInformers does not
// register its event handler, so the cache map stays empty even after the
// informer factory is started and synced.
func TestRegisterCriticalInformers_SkipsDeniedResource(t *testing.T) {
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"}}
	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "n1"}}
	svc := &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "svc1", Namespace: "default"}}
	cs := fake.NewSimpleClientset(pod, node, svc)

	cache := store.NewContextCache(cs, &rest.Config{})
	// Deny pods; allow nodes, services, and other critical resources.
	cache.Lock()
	cache.AllowedResources = map[string]bool{
		"pods":        false,
		"nodes":       true,
		"namespaces":  true,
		"deployments": true,
		"services":    true,
		"events":      true,
	}
	cache.Unlock()

	stopCh := make(chan struct{})
	defer close(stopCh)

	factory := k8sinformers.NewSharedInformerFactory(cs, 0)
	registerCriticalInformers(factory, cache)
	factory.Start(stopCh)
	factory.WaitForCacheSync(stopCh)

	// Brief pause so AddFunc handlers can execute after the cache sync signals.
	time.Sleep(20 * time.Millisecond)

	cache.RLock()
	podCount := len(cache.Pods)
	nodeCount := len(cache.Nodes)
	svcCount := len(cache.Services)
	cache.RUnlock()

	if podCount != 0 {
		t.Errorf("expected 0 pods in cache (informer denied by RBAC), got %d", podCount)
	}
	if nodeCount != 1 {
		t.Errorf("expected 1 node in cache (informer allowed by RBAC), got %d", nodeCount)
	}
	if svcCount != 1 {
		t.Errorf("expected 1 service in critical cache (services moved to critical path), got %d", svcCount)
	}
}

// TestRegisterCriticalInformers_NilAllowed_PermissiveStart verifies that a nil
// AllowedResources map (RBAC probe not yet run) results in all informers being
// registered, so all resources populate the cache.
func TestRegisterCriticalInformers_NilAllowed_PermissiveStart(t *testing.T) {
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"}}
	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "n1"}}
	cs := fake.NewSimpleClientset(pod, node)

	cache := store.NewContextCache(cs, &rest.Config{})
	// AllowedResources is nil by default from NewContextCache — permissive.

	stopCh := make(chan struct{})
	defer close(stopCh)

	factory := k8sinformers.NewSharedInformerFactory(cs, 0)
	registerCriticalInformers(factory, cache)
	factory.Start(stopCh)
	factory.WaitForCacheSync(stopCh)
	time.Sleep(20 * time.Millisecond)

	cache.RLock()
	podCount := len(cache.Pods)
	nodeCount := len(cache.Nodes)
	cache.RUnlock()

	if podCount != 1 {
		t.Errorf("expected 1 pod in cache (nil allowed = permissive), got %d", podCount)
	}
	if nodeCount != 1 {
		t.Errorf("expected 1 node in cache (nil allowed = permissive), got %d", nodeCount)
	}
}
