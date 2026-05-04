package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/podscape/go-core/internal/prometheus"
)

// ── Prometheus ──────────────────────────────────────────────────────────────

func HandlePrometheusStatus(w http.ResponseWriter, r *http.Request) {
	// If the renderer passes a manual URL override, apply it before probing.
	if u := r.URL.Query().Get("url"); u != "" {
		if err := prometheus.SetManualURL(u); err != nil {
			http.Error(w, "invalid Prometheus URL: "+err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		// Explicitly clear any stale manual URL so auto-discovery takes over.
		prometheus.SetManualURL("") //nolint:errcheck — empty string always succeeds
	}
	result := prometheus.ProbePrometheus()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func HandlePrometheusQueryBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req prometheus.BatchQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	results := prometheus.QueryRangeBatch(req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// HandlePrometheusClearCache evicts all cached query results immediately.
// Called by the renderer's global refresh action so charts always refetch
// fresh Prometheus data after an explicit user-initiated refresh.
func HandlePrometheusClearCache(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	prometheus.ClearCache()
	w.WriteHeader(http.StatusNoContent)
}
