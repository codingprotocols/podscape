package k8sutil_test

import (
	"testing"

	"github.com/podscape/go-core/internal/k8sutil"
)

// TestKindGVR_Completeness verifies every entry has a non-empty Resource and Version.
func TestKindGVR_Completeness(t *testing.T) {
	for kind, gvr := range k8sutil.KindGVR {
		if gvr.Resource == "" {
			t.Errorf("KindGVR[%q].Resource is empty", kind)
		}
		if gvr.Version == "" {
			t.Errorf("KindGVR[%q].Version is empty", kind)
		}
	}
}

// TestClusterScopedKinds_AllInKindGVR ensures every cluster-scoped kind has a
// corresponding KindGVR entry, so callers that look up the GVR and then check
// cluster-scope will never get an inconsistent result.
func TestClusterScopedKinds_AllInKindGVR(t *testing.T) {
	for kind := range k8sutil.ClusterScopedKinds {
		if _, ok := k8sutil.KindGVR[kind]; !ok {
			t.Errorf("ClusterScopedKinds[%q] has no matching entry in KindGVR", kind)
		}
	}
}

// TestKindGVRFallback_AllInKindGVR ensures every fallback kind also has a primary
// entry, and that the fallback is actually a different version.
func TestKindGVRFallback_AllInKindGVR(t *testing.T) {
	for kind, fallback := range k8sutil.KindGVRFallback {
		primary, ok := k8sutil.KindGVR[kind]
		if !ok {
			t.Errorf("KindGVRFallback[%q] has no matching entry in KindGVR", kind)
			continue
		}
		if primary.Version == fallback.Version {
			t.Errorf("KindGVRFallback[%q] has the same version as KindGVR (%q); fallback would be a no-op", kind, primary.Version)
		}
		if primary.Resource != fallback.Resource {
			t.Errorf("KindGVRFallback[%q].Resource = %q, want %q to match primary", kind, fallback.Resource, primary.Resource)
		}
	}
}

// TestKindGVR_HPAUsesV2 guards against accidental downgrade of the HPA API version.
func TestKindGVR_HPAUsesV2(t *testing.T) {
	for _, kind := range []string{"hpa", "horizontalpodautoscaler"} {
		gvr, ok := k8sutil.KindGVR[kind]
		if !ok {
			t.Fatalf("KindGVR[%q] is missing", kind)
		}
		if gvr.Version != "v2" {
			t.Errorf("KindGVR[%q].Version = %q, want \"v2\"", kind, gvr.Version)
		}
	}
}

// TestKindGVR_HPAFallbackIsV1 verifies the fallback is the older v1 API.
func TestKindGVR_HPAFallbackIsV1(t *testing.T) {
	for _, kind := range []string{"hpa", "horizontalpodautoscaler"} {
		gvr, ok := k8sutil.KindGVRFallback[kind]
		if !ok {
			t.Fatalf("KindGVRFallback[%q] is missing", kind)
		}
		if gvr.Version != "v1" {
			t.Errorf("KindGVRFallback[%q].Version = %q, want \"v1\"", kind, gvr.Version)
		}
	}
}

// TestKindGVR_AliasesMatchCanonical verifies short aliases resolve to the same
// GVR as their canonical form.
func TestKindGVR_AliasesMatchCanonical(t *testing.T) {
	cases := []struct{ alias, canonical string }{
		{"hpa", "horizontalpodautoscaler"},
		{"pdb", "poddisruptionbudget"},
		{"pvc", "persistentvolumeclaim"},
		{"pv", "persistentvolume"},
		{"crd", "customresourcedefinition"},
	}
	for _, tc := range cases {
		t.Run(tc.alias, func(t *testing.T) {
			aliasGVR, ok := k8sutil.KindGVR[tc.alias]
			if !ok {
				t.Fatalf("KindGVR[%q] is missing", tc.alias)
			}
			canonicalGVR, ok := k8sutil.KindGVR[tc.canonical]
			if !ok {
				t.Fatalf("KindGVR[%q] is missing", tc.canonical)
			}
			if aliasGVR != canonicalGVR {
				t.Errorf("KindGVR[%q] = %+v, want %+v (same as %q)", tc.alias, aliasGVR, canonicalGVR, tc.canonical)
			}
		})
	}
}
