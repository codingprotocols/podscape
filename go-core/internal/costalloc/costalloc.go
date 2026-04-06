// Package costalloc detects and queries cost allocation data from either
// Kubecost (/model/allocation) or OpenCost (/allocation/compute).
// Detection tries Kubecost first; if unavailable, falls back to OpenCost.
// No binary is bundled — this package is a pure HTTP client.
package costalloc

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

var httpClient = &http.Client{Timeout: 5 * time.Second}

// AllocationItem is a normalised cost entry returned by either Kubecost or OpenCost.
type AllocationItem struct {
	Name      string  `json:"name"`
	TotalCost float64 `json:"totalCost"`
	CPUCost   float64 `json:"cpuCost"`
	RAMCost   float64 `json:"ramCost"`
}

// probe performs a minimal allocation query and returns true if the server
// responds with 2xx. It does NOT parse the body.
func probe(endpoint string) bool {
	resp, err := httpClient.Get(endpoint)
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

// Detect checks baseURL for Kubecost then OpenCost.
// Returns "kubecost", "opencost", or "" (not found).
// Never returns a non-nil error — detection failures are silent.
func Detect(baseURL string) (string, error) {
	if probe(baseURL + "/model/allocation?window=1d&aggregate=namespace&accumulate=true") {
		return "kubecost", nil
	}
	if probe(baseURL + "/allocation/compute?window=1d&aggregate=namespace&accumulate=true") {
		return "opencost", nil
	}
	return "", nil
}

// allocationEndpoint returns the correct API path for a given provider.
func allocationEndpoint(baseURL, provider string, q url.Values) string {
	switch provider {
	case "kubecost":
		return baseURL + "/model/allocation?" + q.Encode()
	default: // "opencost"
		return baseURL + "/allocation/compute?" + q.Encode()
	}
}

// QueryAllocation queries the allocation API for the given provider and returns
// a normalised slice of AllocationItems.
//
//   - baseURL:   service root (e.g. "http://localhost:9090")
//   - provider:  "kubecost" or "opencost"
//   - window:    time window ("1d", "7d", "month")
//   - aggregate: grouping ("namespace", "deployment", "pod", "controller")
//   - namespace: optional filter; empty = all namespaces
func QueryAllocation(baseURL, provider, window, aggregate, namespace string) ([]AllocationItem, error) {
	q := url.Values{}
	q.Set("window", window)
	q.Set("aggregate", aggregate)
	q.Set("accumulate", "true")
	if namespace != "" {
		q.Set("filterNamespaces", namespace)
	}

	endpoint := allocationEndpoint(baseURL, provider, q)
	resp, err := httpClient.Get(endpoint)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("cost API returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Both Kubecost and OpenCost use: { "code": 200, "data": [ { "<name>": {...} } ] }
	var envelope struct {
		Code int                          `json:"code"`
		Data []map[string]json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("decode cost response: %w", err)
	}

	var items []AllocationItem
	if len(envelope.Data) == 0 {
		return items, nil
	}
	for name, raw := range envelope.Data[0] {
		var item AllocationItem
		if err := json.Unmarshal(raw, &item); err != nil {
			continue
		}
		item.Name = name
		items = append(items, item)
	}
	return items, nil
}
