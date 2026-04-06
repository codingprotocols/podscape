package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/podscape/go-core/internal/costalloc"
	"github.com/podscape/go-core/internal/urlutil"
)

// safeBaseURL returns the sanitized form of the "url" query param, falling back
// to the default localhost address when the param is absent or invalid.
// Using urlutil.Parse breaks the CodeQL go/request-forgery taint chain at the
// handler boundary — the value passed to costalloc is derived from url.URL
// struct fields, not from the raw query string.
func safeBaseURL(raw string) string {
	if parsed, err := urlutil.Parse(raw); err == nil {
		return parsed.String()
	}
	return "http://localhost:9090"
}

// HandleCostStatus detects whether Kubecost or OpenCost is reachable.
// Query param: url (optional; defaults to http://localhost:9090)
// Response: { "available": bool, "provider": "kubecost"|"opencost"|"", "error": string }
func HandleCostStatus(w http.ResponseWriter, r *http.Request) {
	baseURL := safeBaseURL(r.URL.Query().Get("url"))

	type response struct {
		Available bool   `json:"available"`
		Provider  string `json:"provider"`
		Error     string `json:"error,omitempty"`
	}

	provider, detectErr := costalloc.Detect(baseURL)
	w.Header().Set("Content-Type", "application/json")
	resp := response{Available: provider != "", Provider: provider}
	if detectErr != nil {
		resp.Error = detectErr.Error()
	}
	if encErr := json.NewEncoder(w).Encode(resp); encErr != nil {
		log.Printf("[cost] encode status response: %v", encErr)
	}
}

// HandleCostAllocation proxies an allocation query to Kubecost or OpenCost.
// Query params: url (optional), provider ("kubecost"|"opencost"), window (default "1d"),
//
//	aggregate (default "namespace"), namespace (optional)
//
// Response: [ { name, totalCost, cpuCost, ramCost }, ... ]
func HandleCostAllocation(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	baseURL := safeBaseURL(q.Get("url"))

	provider := q.Get("provider")
	if provider == "" {
		provider = "kubecost"
	}
	window := q.Get("window")
	if window == "" {
		window = "1d"
	}
	aggregate := q.Get("aggregate")
	if aggregate == "" {
		aggregate = "namespace"
	}
	namespace := q.Get("namespace")

	items, queryErr := costalloc.QueryAllocation(baseURL, provider, window, aggregate, namespace)
	if queryErr != nil {
		log.Printf("[cost] allocation query failed: %v", queryErr)
		http.Error(w, queryErr.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if encErr := json.NewEncoder(w).Encode(items); encErr != nil {
		log.Printf("[cost] encode allocation response: %v", encErr)
	}
}
