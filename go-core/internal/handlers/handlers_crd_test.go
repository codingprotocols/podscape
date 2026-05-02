package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/store"
	apiextv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	fakeapiext "k8s.io/apiextensions-apiserver/pkg/client/clientset/clientset/fake"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

// fakeCRD returns a minimal CRD object for use in tests.
func fakeCRD(name string) *apiextv1.CustomResourceDefinition {
	return &apiextv1.CustomResourceDefinition{
		ObjectMeta: metav1.ObjectMeta{Name: name},
	}
}

// setActiveCache sets store.Store.ActiveCache and registers a cleanup that
// restores it to nil after the test.
func setActiveCache(t *testing.T, ac *store.ContextCache) {
	t.Helper()
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	t.Cleanup(func() {
		store.Store.Lock()
		store.Store.ActiveCache = nil
		store.Store.Unlock()
	})
}

func TestHandleCRDs_NoActiveCache(t *testing.T) {
	setActiveCache(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/crds", nil)
	rr := httptest.NewRecorder()
	HandleCRDs(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", rr.Code)
	}
}

func TestHandleCRDs_CacheEmpty_FallsBackToAPI(t *testing.T) {
	crd := fakeCRD("foos.example.com")
	apiextClient := fakeapiext.NewSimpleClientset(crd)

	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	ac.HasData = false
	ac.ApiextensionsClientset = apiextClient
	// CRDs map intentionally left empty to trigger fallback
	setActiveCache(t, ac)

	req := httptest.NewRequest(http.MethodGet, "/crds", nil)
	rr := httptest.NewRecorder()
	HandleCRDs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}
	var items []interface{}
	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(items) != 1 {
		t.Errorf("expected 1 CRD from fallback, got %d", len(items))
	}
}

func TestHandleCRDs_CachePopulated_ServesFromCache(t *testing.T) {
	// Populate the cache with a CRD — fallback should NOT be called.
	apiextClient := fakeapiext.NewSimpleClientset() // empty: if called, returns 0 CRDs

	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	ac.HasData = true
	ac.ApiextensionsClientset = apiextClient
	ac.Lock()
	ac.CRDs["bars.example.com"] = fakeCRD("bars.example.com")
	ac.CRDs["bazs.example.com"] = fakeCRD("bazs.example.com")
	ac.Unlock()
	setActiveCache(t, ac)

	req := httptest.NewRequest(http.MethodGet, "/crds", nil)
	rr := httptest.NewRecorder()
	HandleCRDs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var items []interface{}
	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(items) != 2 {
		t.Errorf("expected 2 CRDs from cache, got %d", len(items))
	}
}

func TestHandleCRDs_CacheEmpty_NoAPIExtClient_ReturnsEmptyArray(t *testing.T) {
	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	ac.HasData = false
	// ApiextensionsClientset intentionally nil
	setActiveCache(t, ac)

	req := httptest.NewRequest(http.MethodGet, "/crds", nil)
	rr := httptest.NewRecorder()
	HandleCRDs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var items []interface{}
	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected empty array, got %d items", len(items))
	}
}

// ── wsStream buffering ─────────────────────────────────────────────────────────

func TestWsStream_BuffersLargeMessage(t *testing.T) {
	// Set up a WebSocket server that sends one 9-byte message and then closes.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		conn.WriteMessage(1 /* TextMessage */, []byte("123456789"))
		// Drain any client messages before closing.
		conn.ReadMessage() //nolint:errcheck
	}))
	defer server.Close()

	wsURL := "ws" + server.URL[len("http"):]

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer ws.Close()

	s := &wsStream{conn: ws}

	// Read in 3-byte chunks — tests that the internal bytes.Buffer correctly
	// reassembles the full message across multiple Read calls.
	var got []byte
	buf := make([]byte, 3)
	for len(got) < 9 {
		n, err := s.Read(buf)
		if err != nil {
			t.Fatalf("Read after %d bytes: %v", len(got), err)
		}
		got = append(got, buf[:n]...)
	}
	if string(got) != "123456789" {
		t.Errorf("expected %q, got %q", "123456789", string(got))
	}
}

func TestWsStream_SingleRead_SmallMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		conn.WriteMessage(1, []byte("hi"))
		conn.ReadMessage() //nolint:errcheck
	}))
	defer server.Close()

	wsURL := "ws" + server.URL[len("http"):]
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer ws.Close()

	s := &wsStream{conn: ws}
	buf := make([]byte, 64)
	n, err := s.Read(buf)
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if string(buf[:n]) != "hi" {
		t.Errorf("expected %q, got %q", "hi", string(buf[:n]))
	}
}

// ── MakeHandler RBAC guard tests ──────────────────────────────────────────────

func TestMakeHandler_DeniedResource_ReturnsEmptyArrayWithHeader(t *testing.T) {
	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	ac.HasData = true
	ac.AllowedResources = map[string]bool{"pods": false}
	// Populate the cache to confirm the RBAC guard fires before cache read.
	ac.Lock()
	ac.Pods["ns/pod1"] = struct{ Name string }{"pod1"}
	ac.Unlock()
	setActiveCache(t, ac)

	req := httptest.NewRequest(http.MethodGet, "/pods", nil)
	rr := httptest.NewRecorder()
	HandlerForResource("pods")(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if rr.Header().Get("X-Podscape-Denied") != "true" {
		t.Error("expected X-Podscape-Denied: true header")
	}
	var items []interface{}
	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected empty array, got %d items", len(items))
	}
}

func TestMakeHandler_AllowedResource_ReturnsData(t *testing.T) {
	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	ac.HasData = true
	ac.AllowedResources = map[string]bool{
		"pods":        true,
		"deployments": true,
		// others intentionally absent — only "pods" is checked
	}
	setActiveCache(t, ac)

	req := httptest.NewRequest(http.MethodGet, "/pods", nil)
	rr := httptest.NewRecorder()
	HandlerForResource("pods")(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if rr.Header().Get("X-Podscape-Denied") != "" {
		t.Error("expected no X-Podscape-Denied header for allowed resource")
	}
}

func TestMakeHandler_NilAllowedResources_Permissive(t *testing.T) {
	// nil AllowedResources means probe hasn't run — treat as allowed.
	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	ac.HasData = true
	// AllowedResources is nil by default from NewContextCache
	setActiveCache(t, ac)

	req := httptest.NewRequest(http.MethodGet, "/pods", nil)
	rr := httptest.NewRecorder()
	HandlerForResource("pods")(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if rr.Header().Get("X-Podscape-Denied") != "" {
		t.Error("nil AllowedResources should be permissive")
	}
}

func TestHandleCRDs_DeniedByRBAC_ReturnsEmptyArrayWithHeader(t *testing.T) {
	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	ac.HasData = true
	ac.AllowedResources = map[string]bool{"customresourcedefinitions": false}
	// Populate cache and apiext client to confirm guard fires before both.
	ac.ApiextensionsClientset = fakeapiext.NewSimpleClientset(fakeCRD("foos.example.com"))
	ac.Lock()
	ac.CRDs["foos.example.com"] = fakeCRD("foos.example.com")
	ac.Unlock()
	setActiveCache(t, ac)

	req := httptest.NewRequest(http.MethodGet, "/crds", nil)
	rr := httptest.NewRecorder()
	HandleCRDs(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if rr.Header().Get("X-Podscape-Denied") != "true" {
		t.Error("expected X-Podscape-Denied: true")
	}
	var items []interface{}
	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected empty array, got %d", len(items))
	}
}

func TestHandleSwitchContext_RBACProbeStored(t *testing.T) {
	// Stub rbacVerbCheckFunc to return a fixed verb map so we can verify it's written
	// to the cache without requiring a live API server.
	fakeVerbMap := map[string]map[string]bool{
		"pods":    {"list": true, "watch": true, "delete": true, "update": true, "patch": true, "create": true},
		"secrets": {"list": false, "watch": false, "delete": false, "update": false, "patch": false, "create": false},
	}
	orig := rbacVerbCheckFunc
	rbacVerbCheckFunc = func(_ context.Context, _ kubernetes.Interface) (map[string]map[string]bool, error) {
		return fakeVerbMap, nil
	}
	t.Cleanup(func() { rbacVerbCheckFunc = orig })

	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	runRBACProbe(ac, "test-ctx", fake.NewSimpleClientset())

	ac.RLock()
	allowed := ac.AllowedResources
	verbs := ac.AllowedVerbs
	ac.RUnlock()

	if allowed == nil {
		t.Fatal("expected AllowedResources to be set")
	}
	if !allowed["pods"] {
		t.Error("expected pods to be allowed")
	}
	if allowed["secrets"] {
		t.Error("expected secrets to be denied")
	}
	if verbs == nil {
		t.Fatal("expected AllowedVerbs to be set")
	}
	if !verbs["pods"]["list"] {
		t.Error("expected pods list to be allowed in AllowedVerbs")
	}
	if verbs["secrets"]["list"] {
		t.Error("expected secrets list to be denied in AllowedVerbs")
	}
}

// TestAllResourceDefs_Count guards against a resource being added to AllResourceDefs
// without the corresponding route in main.go being verified. Update the constant
// when adding a new standard resource to the registry.
func TestAllResourceDefs_Count(t *testing.T) {
	const want = 28
	if got := len(AllResourceDefs); got != want {
		t.Errorf("AllResourceDefs has %d entries, want %d — update this constant after adding/removing a resource", got, want)
	}
}

func TestHandleSwitchContext_RBACProbeFailed_NilAllowed(t *testing.T) {
	// When the probe fails, AllowedResources and AllowedVerbs must remain nil (permissive).
	orig := rbacVerbCheckFunc
	rbacVerbCheckFunc = func(_ context.Context, _ kubernetes.Interface) (map[string]map[string]bool, error) {
		return nil, context.DeadlineExceeded
	}
	t.Cleanup(func() { rbacVerbCheckFunc = orig })

	ac := store.NewContextCache(fake.NewSimpleClientset(), &rest.Config{})
	runRBACProbe(ac, "test-ctx", fake.NewSimpleClientset())

	ac.RLock()
	allowed := ac.AllowedResources
	ac.RUnlock()

	if allowed != nil {
		t.Errorf("expected nil AllowedResources on probe failure, got %v", allowed)
	}
}
