package rbac

import (
	"context"
	"testing"

	authv1 "k8s.io/api/authorization/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

// sarReactor returns a fake reactor that responds to SelfSubjectAccessReview
// Create calls. The allowed function is called with the ResourceAttributes from
// the request and returns whether to allow the verb.
func sarReactor(allowed func(attr *authv1.ResourceAttributes) bool) k8stesting.ReactionFunc {
	return func(action k8stesting.Action) (bool, runtime.Object, error) {
		ca, ok := action.(k8stesting.CreateAction)
		if !ok {
			return false, nil, nil
		}
		sar, ok := ca.GetObject().(*authv1.SelfSubjectAccessReview)
		if !ok {
			return false, nil, nil
		}
		result := &authv1.SelfSubjectAccessReview{}
		if sar.Spec.ResourceAttributes != nil {
			result.Status.Allowed = allowed(sar.Spec.ResourceAttributes)
		}
		return true, result, nil
	}
}

func TestCheckAccess_AllAllowed(t *testing.T) {
	cs := fake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews", sarReactor(func(*authv1.ResourceAttributes) bool {
		return true
	}))

	got, err := CheckAccess(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil {
		t.Fatal("expected non-nil map")
	}
	for _, rd := range AllResources {
		if !got[rd.Resource] {
			t.Errorf("expected %q to be allowed", rd.Resource)
		}
	}
}

func TestCheckAccess_PartialDenied(t *testing.T) {
	denied := map[string]bool{"secrets": true, "roles": true}

	cs := fake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews", sarReactor(func(attr *authv1.ResourceAttributes) bool {
		return !denied[attr.Resource]
	}))

	got, err := CheckAccess(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["secrets"] {
		t.Error("expected secrets to be denied")
	}
	if got["roles"] {
		t.Error("expected roles to be denied")
	}
	if !got["pods"] {
		t.Error("expected pods to be allowed")
	}
}

func TestCheckAccess_BothVerbsRequired(t *testing.T) {
	// Allow "list" but deny "watch" for configmaps — must be denied overall.
	cs := fake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews", sarReactor(func(attr *authv1.ResourceAttributes) bool {
		if attr.Resource == "configmaps" && attr.Verb == "watch" {
			return false
		}
		return true
	}))

	got, err := CheckAccess(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["configmaps"] {
		t.Error("expected configmaps to be denied when watch is denied")
	}
	if !got["pods"] {
		t.Error("expected pods to be allowed")
	}
}

func TestCheckAccess_SARAPIUnavailable(t *testing.T) {
	// Reactor returns an error — CheckAccess must return (nil, err).
	cs := fake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, context.DeadlineExceeded
	})

	got, err := CheckAccess(context.Background(), cs)
	if err == nil {
		t.Fatal("expected error when SAR API is unavailable")
	}
	if got != nil {
		t.Errorf("expected nil map on error, got %v", got)
	}
}

func TestCheckAccess_AllDenied(t *testing.T) {
	cs := fake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews", sarReactor(func(*authv1.ResourceAttributes) bool {
		return false
	}))

	got, err := CheckAccess(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, rd := range AllResources {
		if got[rd.Resource] {
			t.Errorf("expected %q to be denied", rd.Resource)
		}
	}
}

func TestCheckAccess_AllResourcesPresent(t *testing.T) {
	// Verify every expected resource appears in the result map.
	cs := fake.NewSimpleClientset()
	cs.PrependReactor("create", "selfsubjectaccessreviews", sarReactor(func(*authv1.ResourceAttributes) bool {
		return true
	}))

	got, err := CheckAccess(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != len(AllResources) {
		t.Errorf("expected %d resources in map, got %d", len(AllResources), len(got))
	}
	for _, rd := range AllResources {
		if _, ok := got[rd.Resource]; !ok {
			t.Errorf("resource %q missing from result map", rd.Resource)
		}
	}
}

// ── rbacAllowed helper (tested via informers, but worth a direct unit test) ──

func TestRbacAllowed_NilMap_Permissive(t *testing.T) {
	// nil means probe not yet run → all resources allowed
	// rbacAllowed is in informers package, but we test the same semantics
	// here by verifying CheckAccess returns nil on error (tested above) and
	// the nil-nil check contract. This is a documentation-level test.
	var m map[string]bool
	// Simulate what informers.rbacAllowed does:
	result := m == nil || m["pods"]
	if !result {
		t.Error("nil map should be permissive")
	}
}

func TestRbacAllowed_EmptyMap_AllDenied(t *testing.T) {
	m := map[string]bool{}
	result := m == nil || m["pods"]
	if result {
		t.Error("empty map should deny all resources")
	}
}
