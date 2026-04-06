package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/podscape/go-core/internal/costalloc"
)

// HandleCostStatus detects whether Kubecost or OpenCost is reachable.
// Query param: url (optional; defaults to http://localhost:9090)
// Response: { "available": bool, "provider": "kubecost"|"opencost"|"", "error": string }
func HandleCostStatus(w http.ResponseWriter, r *http.Request) {
	baseURL := r.URL.Query().Get("url")
	if baseURL == "" {
		baseURL = "http://localhost:9090"
	}

	type response struct {
		Available bool   `json:"available"`
		Provider  string `json:"provider"`
		Error     string `json:"error,omitempty"`
	}

	provider, err := costalloc.Detect(baseURL)
	w.Header().Set("Content-Type", "application/json")
	resp := response{Available: provider != "", Provider: provider}
	if err != nil {
		resp.Error = err.Error()
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
	baseURL := q.Get("url")
	if baseURL == "" {
		baseURL = "http://localhost:9090"
	}
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

	items, err := costalloc.QueryAllocation(baseURL, provider, window, aggregate, namespace)
	if err != nil {
		log.Printf("[cost] allocation query failed: %v", err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if encErr := json.NewEncoder(w).Encode(items); encErr != nil {
		log.Printf("[cost] encode allocation response: %v", encErr)
	}
}
