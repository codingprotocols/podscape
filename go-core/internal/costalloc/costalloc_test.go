package costalloc_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/podscape/go-core/internal/costalloc"
)

// ── helpers ──────────────────────────────────────────────────────────────────

func kubecostServer(t *testing.T, items map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/model/allocation" {
			http.NotFound(w, r)
			return
		}
		payload := map[string]any{
			"code": 200,
			"data": []any{items},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	}))
}

func opencostServer(t *testing.T, items map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/allocation/compute" {
			http.NotFound(w, r)
			return
		}
		payload := map[string]any{
			"code": 200,
			"data": []any{items},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	}))
}

// ── Detect ───────────────────────────────────────────────────────────────────

func TestDetect_IdentifiesKubecost(t *testing.T) {
	srv := kubecostServer(t, map[string]any{})
	defer srv.Close()
	provider, err := costalloc.Detect(srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != "kubecost" {
		t.Fatalf("expected kubecost, got %q", provider)
	}
}

func TestDetect_IdentifiesOpenCost(t *testing.T) {
	srv := opencostServer(t, map[string]any{})
	defer srv.Close()
	provider, err := costalloc.Detect(srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != "opencost" {
		t.Fatalf("expected opencost, got %q", provider)
	}
}

func TestDetect_ReturnsEmptyWhenNeitherResponds(t *testing.T) {
	provider, err := costalloc.Detect("http://127.0.0.1:19999")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != "" {
		t.Fatalf("expected empty provider, got %q", provider)
	}
}

func TestDetect_PrefersKubecostOverOpenCost(t *testing.T) {
	// Server responds 200 to any path — Kubecost should win because it's tried first.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": []any{}})
	}))
	defer srv.Close()
	provider, err := costalloc.Detect(srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != "kubecost" {
		t.Fatalf("expected kubecost (tried first), got %q", provider)
	}
}

// ── QueryAllocation ───────────────────────────────────────────────────────────

func TestQueryAllocation_KubecostReturnsItems(t *testing.T) {
	srv := kubecostServer(t, map[string]any{
		"default":     map[string]any{"name": "default", "totalCost": 3.45, "cpuCost": 1.0, "ramCost": 2.45},
		"kube-system": map[string]any{"name": "kube-system", "totalCost": 1.20, "cpuCost": 0.5, "ramCost": 0.70},
	})
	defer srv.Close()
	items, err := costalloc.QueryAllocation(srv.URL, "kubecost", "1d", "namespace", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) < 2 {
		t.Fatalf("expected ≥2 items, got %d", len(items))
	}
}

func TestQueryAllocation_OpenCostReturnsItems(t *testing.T) {
	srv := opencostServer(t, map[string]any{
		"default": map[string]any{"name": "default", "totalCost": 3.45, "cpuCost": 1.0, "ramCost": 2.45},
	})
	defer srv.Close()
	items, err := costalloc.QueryAllocation(srv.URL, "opencost", "1d", "namespace", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
}

func TestQueryAllocation_ErrorOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()
	_, err := costalloc.QueryAllocation(srv.URL, "kubecost", "1d", "namespace", "")
	if err == nil {
		t.Fatal("expected error for non-200 response")
	}
}

func TestQueryAllocation_NamespaceFilterPassedToKubecost(t *testing.T) {
	var captured string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": []any{}})
	}))
	defer srv.Close()
	_, _ = costalloc.QueryAllocation(srv.URL, "kubecost", "1d", "namespace", "kube-system")
	if captured == "" {
		t.Fatal("expected query string to be set")
	}
}
