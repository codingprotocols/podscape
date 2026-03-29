package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"

	"github.com/podscape/go-core/internal/store"
)

// restoreCustomResourceGlobals resets injectable vars used by HandleCustomResource.
func restoreCustomResourceGlobals(t *testing.T, origDynFactory func(*rest.Config) (dynamic.Interface, error)) {
	t.Helper()
	t.Cleanup(func() {
		dynClientFactory = origDynFactory
	})
}

func TestHandleCustomResource(t *testing.T) {
	ClearGVCache()
	t.Cleanup(ClearGVCache)
	origDynFactory := dynClientFactory

	t.Run("missing crd param returns 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/custom", nil)
		rr := httptest.NewRecorder()
		HandleCustomResource(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d (body: %s)", rr.Code, rr.Body.String())
		}
		if !strings.Contains(rr.Body.String(), "crd query parameter is required") {
			t.Errorf("unexpected body: %s", rr.Body.String())
		}
	})

	t.Run("invalid crd name with no dot returns 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/custom?crd=ingressroutes", nil)
		rr := httptest.NewRecorder()
		HandleCustomResource(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d (body: %s)", rr.Code, rr.Body.String())
		}
		if !strings.Contains(rr.Body.String(), "invalid crd name") {
			t.Errorf("unexpected body: %s", rr.Body.String())
		}
	})

	t.Run("nil clientset returns 200 with empty array", func(t *testing.T) {
		store.Store.Lock()
		origCache := store.Store.ActiveCache
		store.Store.ActiveCache = nil
		store.Store.Unlock()
		t.Cleanup(func() {
			store.Store.Lock()
			store.Store.ActiveCache = origCache
			store.Store.Unlock()
		})

		req := httptest.NewRequest(http.MethodGet, "/custom?crd=ingressroutes.traefik.io", nil)
		rr := httptest.NewRecorder()
		HandleCustomResource(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
		}
		var items []interface{}
		if err := json.Unmarshal(rr.Body.Bytes(), &items); err != nil {
			t.Fatalf("could not parse body as JSON: %v (body: %s)", err, rr.Body.String())
		}
		if len(items) != 0 {
			t.Errorf("expected empty array, got %d items", len(items))
		}
	})

	t.Run("unknown API group returns 500 containing not found", func(t *testing.T) {
		// fake.NewSimpleClientset() discovery has no custom API groups by default,
		// so preferredGroupVersion will return "not found" for "traefik.io".
		fakeCS := fake.NewSimpleClientset()
		cache := store.NewContextCache(fakeCS, &rest.Config{})
		cache.CacheReady = true

		store.Store.Lock()
		origCache := store.Store.ActiveCache
		store.Store.ActiveCache = cache
		store.Store.Unlock()
		t.Cleanup(func() {
			store.Store.Lock()
			store.Store.ActiveCache = origCache
			store.Store.Unlock()
		})

		req := httptest.NewRequest(http.MethodGet, "/custom?crd=ingressroutes.traefik.io", nil)
		rr := httptest.NewRecorder()
		HandleCustomResource(rr, req)

		if rr.Code != http.StatusInternalServerError {
			t.Errorf("expected 500, got %d (body: %s)", rr.Code, rr.Body.String())
		}
		body := strings.ToLower(rr.Body.String())
		if !strings.Contains(body, "not found") {
			t.Errorf("expected body to contain 'not found', got: %s", rr.Body.String())
		}
	})

	t.Run("list returns items for known API group", func(t *testing.T) {
		ClearGVCache()
		restoreCustomResourceGlobals(t, origDynFactory)

		// Build a fake clientset whose discovery returns the traefik.io group.
		fakeCS := fake.NewSimpleClientset()
		fakeCS.Resources = []*metav1.APIResourceList{
			{
				GroupVersion: "traefik.io/v1alpha1",
				APIResources: []metav1.APIResource{
					{Name: "ingressroutes", Kind: "IngressRoute"},
				},
			},
		}

		cache := store.NewContextCache(fakeCS, &rest.Config{})
		cache.CacheReady = true

		store.Store.Lock()
		origCache := store.Store.ActiveCache
		store.Store.ActiveCache = cache
		store.Store.Unlock()
		t.Cleanup(func() {
			store.Store.Lock()
			store.Store.ActiveCache = origCache
			store.Store.Unlock()
		})

		// Build a fake dynamic client pre-seeded with one IngressRoute object.
		gvr := schema.GroupVersionResource{
			Group:    "traefik.io",
			Version:  "v1alpha1",
			Resource: "ingressroutes",
		}
		obj := &unstructured.Unstructured{Object: map[string]interface{}{
			"apiVersion": "traefik.io/v1alpha1",
			"kind":       "IngressRoute",
			"metadata": map[string]interface{}{
				"name":      "my-route",
				"namespace": "default",
			},
		}}
		scheme := runtime.NewScheme()
		dynFake := dynfake.NewSimpleDynamicClientWithCustomListKinds(
			scheme,
			map[schema.GroupVersionResource]string{gvr: "IngressRouteList"},
			obj,
		)

		// Inject the fake dynamic client.
		dynClientFactory = func(_ *rest.Config) (dynamic.Interface, error) {
			return dynFake, nil
		}

		req := httptest.NewRequest(http.MethodGet, "/custom?crd=ingressroutes.traefik.io&namespace=default", nil)
		rr := httptest.NewRecorder()
		HandleCustomResource(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
		}
		var items []interface{}
		if err := json.Unmarshal(rr.Body.Bytes(), &items); err != nil {
			t.Fatalf("could not parse body as JSON: %v (body: %s)", err, rr.Body.String())
		}
		if len(items) != 1 {
			t.Errorf("expected 1 item, got %d (body: %s)", len(items), rr.Body.String())
		}
		itemMap, ok := items[0].(map[string]interface{})
		if !ok {
			t.Fatalf("item[0] is not a map")
		}
		meta, ok := itemMap["metadata"].(map[string]interface{})
		if !ok {
			t.Fatalf("item[0].metadata is not a map")
		}
		if meta["name"] != "my-route" {
			t.Errorf("expected name 'my-route', got %v", meta["name"])
		}
	})
}

// TestPreferredGroupVersion tests the helper function directly.
func TestPreferredGroupVersion(t *testing.T) {
	ClearGVCache()
	t.Cleanup(ClearGVCache)
	t.Run("returns preferred version for known group", func(t *testing.T) {
		fakeCS := fake.NewSimpleClientset()
		fakeCS.Resources = []*metav1.APIResourceList{
			{
				GroupVersion: "traefik.io/v1alpha1",
				APIResources: []metav1.APIResource{
					{Name: "ingressroutes", Kind: "IngressRoute"},
				},
			},
		}
		version, err := preferredGroupVersion(fakeCS, "traefik.io")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if version != "v1alpha1" {
			t.Errorf("expected 'v1alpha1', got %q", version)
		}
	})

	t.Run("returns error for unknown group", func(t *testing.T) {
		fakeCS := fake.NewSimpleClientset()
		_, err := preferredGroupVersion(fakeCS, "does-not-exist.io")
		if err == nil {
			t.Error("expected error for unknown group, got nil")
		}
		if !strings.Contains(err.Error(), "not found") {
			t.Errorf("expected 'not found' in error, got: %v", err)
		}
	})
}

func TestClearGVCache(t *testing.T) {
	// Seed the cache with a known entry.
	gvCacheMu.Lock()
	gvCacheMap["ctx\x00test.io"] = groupVersionEntry{version: "v1", expiry: time.Now().Add(time.Minute)}
	gvCacheMu.Unlock()

	// Confirm it's there.
	gvCacheMu.RLock()
	_, exists := gvCacheMap["ctx\x00test.io"]
	gvCacheMu.RUnlock()
	if !exists {
		t.Fatal("pre-condition: cache entry should exist before ClearGVCache")
	}

	ClearGVCache()

	// Confirm it's gone.
	gvCacheMu.RLock()
	_, exists = gvCacheMap["ctx\x00test.io"]
	gvCacheMu.RUnlock()
	if exists {
		t.Error("ClearGVCache should have evicted all entries")
	}

	// Confirm the map itself is non-nil (not just zeroed out).
	gvCacheMu.RLock()
	mapNil := gvCacheMap == nil
	gvCacheMu.RUnlock()
	if mapNil {
		t.Error("ClearGVCache must replace the map, not nil it")
	}
}
