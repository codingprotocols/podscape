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
	"strings"
	"time"

	"github.com/podscape/go-core/internal/urlutil"
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
// responds with 2xx and non-HTML content. Rejecting text/html prevents false
// positives when a proxy or UI page returns 200 OK with an HTML error page.
func probe(u *url.URL) bool {
	resp, err := httpClient.Get(u.String())
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false
	}
	return !strings.Contains(resp.Header.Get("Content-Type"), "text/html")
}

// Detect checks baseURL for Kubecost then OpenCost.
// Returns "kubecost", "opencost", or "" (not found).
// Never returns a non-nil error — detection failures are silent.
func Detect(baseURL string) (string, error) {
	base, err := urlutil.Parse(baseURL)
	if err != nil {
		return "", nil
	}
	probeQ := url.Values{}
	probeQ.Set("window", "1d")
	probeQ.Set("aggregate", "namespace")
	probeQ.Set("accumulate", "true")
	if probe(mustParse(urlutil.Build(base, "/model/allocation", probeQ))) {
		return "kubecost", nil
	}
	if probe(mustParse(urlutil.Build(base, "/allocation/compute", probeQ))) {
		return "opencost", nil
	}
	return "", nil
}

// mustParse parses a URL that was constructed internally from validated
// components. Panics only if our own urlutil.Build produces an invalid URL,
// which indicates a programming error.
func mustParse(s string) *url.URL {
	u, err := url.Parse(s)
	if err != nil {
		panic(fmt.Sprintf("costalloc: internal URL construction failed: %v", err))
	}
	return u
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
	base, err := urlutil.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid cost provider URL: %w", err)
	}

	q := url.Values{}
	q.Set("window", window)
	q.Set("aggregate", aggregate)
	q.Set("accumulate", "true")
	if namespace != "" {
		q.Set("filterNamespaces", namespace)
	}

	var path string
	if provider == "kubecost" {
		path = "/model/allocation"
	} else {
		path = "/allocation/compute"
	}
	endpoint := urlutil.Build(base, path, q)

	resp, err := httpClient.Get(endpoint)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("cost API returned %d", resp.StatusCode)
	}

	// Reject HTML responses early — a proxy or misconfigured port-forward can
	// return 200 OK with an HTML page, producing a confusing JSON parse error.
	if strings.Contains(resp.Header.Get("Content-Type"), "text/html") {
		_ = resp.Body.Close()
		return nil, fmt.Errorf("cost API returned HTML instead of JSON — check that the port-forward targets the correct service and port")
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
		preview := string(body)
		if len(preview) > 120 {
			preview = preview[:120] + "…"
		}
		return nil, fmt.Errorf("decode cost response: %w (body: %s)", err, preview)
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
