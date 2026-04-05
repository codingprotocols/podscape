package providers_test

import (
	"fmt"
	"testing"

	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	fakediscovery "k8s.io/client-go/discovery/fake"
	fakeclient "k8s.io/client-go/kubernetes/fake"
	openapi "k8s.io/client-go/openapi"
	restclient "k8s.io/client-go/rest"

	openapi_v2 "github.com/google/gnostic-models/openapiv2"
	"k8s.io/apimachinery/pkg/version"

	"github.com/podscape/go-core/internal/providers"
)

// makeDiscovery returns a FakeDiscovery pre-loaded with the given API groups.
// FakeDiscovery.ServerGroups() derives groups from Resources[].GroupVersion,
// so we add one APIResourceList entry per group we want detected.
func makeDiscovery(groupVersions ...string) *fakediscovery.FakeDiscovery {
	c := fakeclient.NewClientset()
	fd := c.Discovery().(*fakediscovery.FakeDiscovery)
	fd.Resources = nil
	for _, gv := range groupVersions {
		fd.Resources = append(fd.Resources, &metav1.APIResourceList{
			GroupVersion: gv,
		})
	}
	return fd
}

func TestDetect_NoProviders(t *testing.T) {
	ps := providers.Detect(makeDiscovery(), nil)
	if ps.Istio || ps.Traefik || ps.NginxInc || ps.NginxCommunity {
		t.Errorf("expected all false, got %+v", ps)
	}
}

func TestDetect_Istio(t *testing.T) {
	ps := providers.Detect(makeDiscovery("networking.istio.io/v1alpha3"), nil)
	if !ps.Istio {
		t.Error("expected Istio=true")
	}
	if ps.IstioVersion == "" {
		t.Error("expected IstioVersion to be set")
	}
	if ps.Traefik || ps.NginxInc || ps.NginxCommunity {
		t.Errorf("unexpected providers set: %+v", ps)
	}
}

func TestDetect_TraefikV3(t *testing.T) {
	ps := providers.Detect(makeDiscovery("traefik.io/v1alpha1"), nil)
	if !ps.Traefik {
		t.Error("expected Traefik=true")
	}
	if ps.TraefikVersion != "v3" {
		t.Errorf("expected TraefikVersion=v3, got %q", ps.TraefikVersion)
	}
}

func TestDetect_TraefikV2(t *testing.T) {
	ps := providers.Detect(makeDiscovery("traefik.containo.us/v1alpha1"), nil)
	if !ps.Traefik {
		t.Error("expected Traefik=true")
	}
	if ps.TraefikVersion != "v2" {
		t.Errorf("expected TraefikVersion=v2, got %q", ps.TraefikVersion)
	}
}

func TestDetect_TraefikV3WinsOverV2(t *testing.T) {
	// Both API groups present — v3 must win regardless of iteration order.
	ps := providers.Detect(makeDiscovery("traefik.io/v1alpha1", "traefik.containo.us/v1alpha1"), nil)
	if !ps.Traefik {
		t.Error("expected Traefik=true")
	}
	if ps.TraefikVersion != "v3" {
		t.Errorf("expected v3 to win, got %q", ps.TraefikVersion)
	}
}

func TestDetect_NginxInc(t *testing.T) {
	ps := providers.Detect(makeDiscovery("k8s.nginx.org/v1"), nil)
	if !ps.NginxInc {
		t.Error("expected NginxInc=true")
	}
	if ps.NginxCommunity {
		t.Error("NginxCommunity should be false when no IngressClass matches")
	}
}

func TestDetect_NginxCommunity_ViaIngressClass(t *testing.T) {
	ic := networkingv1.IngressClass{
		Spec: networkingv1.IngressClassSpec{Controller: "k8s.io/ingress-nginx"},
	}
	ps := providers.Detect(makeDiscovery(), []networkingv1.IngressClass{ic})
	if !ps.NginxCommunity {
		t.Error("expected NginxCommunity=true")
	}
	if ps.NginxInc {
		t.Error("NginxInc should be false")
	}
}

func TestDetect_NginxCommunity_PartialControllerString(t *testing.T) {
	ic := networkingv1.IngressClass{
		Spec: networkingv1.IngressClassSpec{Controller: "some-vendor/ingress-nginx"},
	}
	ps := providers.Detect(makeDiscovery(), []networkingv1.IngressClass{ic})
	if !ps.NginxCommunity {
		t.Error("expected NginxCommunity=true for partial controller match")
	}
}

func TestDetect_NginxCommunity_CaseInsensitive(t *testing.T) {
	ic := networkingv1.IngressClass{
		Spec: networkingv1.IngressClassSpec{Controller: "INGRESS-NGINX"},
	}
	ps := providers.Detect(makeDiscovery(), []networkingv1.IngressClass{ic})
	if !ps.NginxCommunity {
		t.Error("expected NginxCommunity=true for uppercase controller")
	}
}

func TestDetect_DiscoveryFailure_ReturnsEmptySet(t *testing.T) {
	ps := providers.Detect(&errorDiscovery{}, nil)
	if ps.Istio || ps.Traefik || ps.NginxInc || ps.NginxCommunity {
		t.Errorf("expected all false on discovery error, got %+v", ps)
	}
}

// errorDiscovery is a minimal discovery.DiscoveryInterface that always errors on ServerGroups.
type errorDiscovery struct{}

func (e *errorDiscovery) ServerGroups() (*metav1.APIGroupList, error) {
	return nil, fmt.Errorf("discovery unavailable")
}
func (e *errorDiscovery) ServerGroupsAndResources() ([]*metav1.APIGroup, []*metav1.APIResourceList, error) {
	return nil, nil, nil
}
func (e *errorDiscovery) ServerResourcesForGroupVersion(_ string) (*metav1.APIResourceList, error) {
	return nil, nil
}
func (e *errorDiscovery) ServerPreferredResources() ([]*metav1.APIResourceList, error) {
	return nil, nil
}
func (e *errorDiscovery) ServerPreferredNamespacedResources() ([]*metav1.APIResourceList, error) {
	return nil, nil
}
func (e *errorDiscovery) ServerVersion() (*version.Info, error)        { return nil, nil }
func (e *errorDiscovery) OpenAPISchema() (*openapi_v2.Document, error) { return nil, nil }
func (e *errorDiscovery) OpenAPIV3() openapi.Client                    { return nil }
func (e *errorDiscovery) RESTClient() restclient.Interface             { return nil }
func (e *errorDiscovery) WithLegacy() discovery.DiscoveryInterface {
	return e
}

// Ensure errorDiscovery satisfies discovery.DiscoveryInterface at compile time.
var _ interface {
	ServerGroups() (*metav1.APIGroupList, error)
} = &errorDiscovery{}

// Suppress unused import warning for schema (used in makeDiscovery indirectly via fake client).
var _ = schema.GroupVersionResource{}
