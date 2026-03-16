package prometheus

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestParseRangeResult_Success(t *testing.T) {
	raw := []byte(`{
		"status": "success",
		"data": {
			"result": [
				{"metric": {}, "values": [[1700000000, "1.5"], [1700000060, "2.0"]]}
			]
		}
	}`)
	pts, err := parseRangeResult(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pts) != 2 {
		t.Fatalf("expected 2 points, got %d", len(pts))
	}
	if pts[0].Timestamp != 1700000000 {
		t.Errorf("expected ts=1700000000, got %d", pts[0].Timestamp)
	}
	if pts[0].Value != 1.5 {
		t.Errorf("expected value=1.5, got %f", pts[0].Value)
	}
}

func TestParseRangeResult_StatusError(t *testing.T) {
	raw := []byte(`{"status": "error", "data": {"result": []}}`)
	_, err := parseRangeResult(raw)
	if err == nil {
		t.Fatal("expected error for non-success status")
	}
}

func TestParseRangeResult_InvalidJSON(t *testing.T) {
	_, err := parseRangeResult([]byte(`not json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestParseRangeResult_EmptyResult(t *testing.T) {
	raw := []byte(`{"status": "success", "data": {"result": []}}`)
	pts, err := parseRangeResult(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pts) != 0 {
		t.Errorf("expected 0 points, got %d", len(pts))
	}
}

func TestProbePrometheus_ManualURL_Found(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}))
	defer srv.Close()

	SetManualURL(srv.URL)
	defer SetManualURL("")

	result := ProbePrometheus()
	if !result.Available {
		t.Errorf("expected Available=true for reachable server, got error: %s", result.Error)
	}
}

func TestProbePrometheus_ManualURL_Unreachable(t *testing.T) {
	SetManualURL("http://127.0.0.1:19999") // nothing listens here
	defer SetManualURL("")

	result := ProbePrometheus()
	if result.Available {
		t.Error("expected Available=false for unreachable server")
	}
	if result.Error == "" {
		t.Error("expected a non-empty error message when probe fails")
	}
}

func TestQueryRangeBatch_DefaultsStartEnd(t *testing.T) {
	// Without a reachable Prometheus, QueryRangeBatch should return results
	// with errors but never panic, and the timing defaults should apply.
	req := BatchQueryRequest{
		Queries: []QueryRequest{{Query: "up", Label: "test"}},
		// StartTime and EndTime intentionally left zero
	}
	results := QueryRangeBatch(req)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Label != "test" {
		t.Errorf("expected label 'test', got %q", results[0].Label)
	}
}

func TestParseKubeSvcURL(t *testing.T) {
	cases := []struct {
		url       string
		wantNil   bool
		wantSvc   string
		wantNS    string
		wantPort  string
	}{
		// Full .svc.cluster.local with port
		{"http://prometheus-operated.monitoring.svc.cluster.local:9090", false, "prometheus-operated", "monitoring", "9090"},
		// Short .svc form
		{"http://prometheus.prometheus.svc:9090", false, "prometheus", "prometheus", "9090"},
		// No port — should default to 80
		{"http://prometheus-operated.monitoring.svc.cluster.local", false, "prometheus-operated", "monitoring", "80"},
		// HTTPS no port — should default to 443
		{"https://prometheus-operated.monitoring.svc.cluster.local", false, "prometheus-operated", "monitoring", "443"},
		// Regular external URL — not a k8s service URL
		{"http://localhost:9090", true, "", "", ""},
		{"http://prometheus.example.com", true, "", "", ""},
	}
	for _, c := range cases {
		ref := parseKubeSvcURL(c.url)
		if c.wantNil {
			if ref != nil {
				t.Errorf("parseKubeSvcURL(%q): expected nil, got %+v", c.url, ref)
			}
			continue
		}
		if ref == nil {
			t.Errorf("parseKubeSvcURL(%q): expected non-nil result", c.url)
			continue
		}
		if ref.service != c.wantSvc {
			t.Errorf("parseKubeSvcURL(%q): service=%q, want %q", c.url, ref.service, c.wantSvc)
		}
		if ref.namespace != c.wantNS {
			t.Errorf("parseKubeSvcURL(%q): namespace=%q, want %q", c.url, ref.namespace, c.wantNS)
		}
		if ref.port != c.wantPort {
			t.Errorf("parseKubeSvcURL(%q): port=%q, want %q", c.url, ref.port, c.wantPort)
		}
	}
}

func TestNormalizeURL(t *testing.T) {
	cases := []struct {
		input   string
		want    string
		wantErr bool
	}{
		{"http://localhost:9090", "http://127.0.0.1:9090", false},
		{"http://localhost:9090/", "http://127.0.0.1:9090", false},
		{"localhost:9090", "http://127.0.0.1:9090", false},
		{"localhost:9090/", "http://127.0.0.1:9090", false},
		{"  http://localhost:9090  ", "http://127.0.0.1:9090", false},
		{"https://prom.example.com", "https://prom.example.com", false},
		{"http://127.0.0.1:9090", "http://127.0.0.1:9090", false},
		{"", "", true},
	}
	for _, c := range cases {
		got, err := normalizeURL(c.input)
		if c.wantErr {
			if err == nil {
				t.Errorf("normalizeURL(%q): expected error, got %q", c.input, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("normalizeURL(%q): unexpected error: %v", c.input, err)
			continue
		}
		if got != c.want {
			t.Errorf("normalizeURL(%q): got %q, want %q", c.input, got, c.want)
		}
	}
}

func TestSetManualURL_NormalizesInput(t *testing.T) {
	SetManualURL("localhost:9090/")
	got := getManualURL()
	SetManualURL("")
	if got != "http://127.0.0.1:9090" {
		t.Errorf("expected normalized URL 'http://127.0.0.1:9090', got %q", got)
	}
}

func TestQueryCache_HitAvoidsFetch(t *testing.T) {
	fetchCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetchCount++
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "success",
			"data":   map[string]interface{}{"result": []interface{}{}},
		})
	}))
	defer srv.Close()

	SetManualURL(srv.URL)
	defer SetManualURL("")

	// Clear any stale entries by using a unique query with future TTL.
	start := time.Now().Unix() - 3600
	end := time.Now().Unix()

	_, _ = queryRangeSingle("test_cache_query_"+t.Name(), start, end, 15)
	_, _ = queryRangeSingle("test_cache_query_"+t.Name(), start, end, 15)

	if fetchCount != 1 {
		t.Errorf("expected 1 fetch (cache hit on second call), got %d", fetchCount)
	}
}
