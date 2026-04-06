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
)

var httpClient = &http.Client{Timeout: 5 * time.Second}

// AllocationItem is a normalised cost entry returned by either Kubecost or OpenCost.
type AllocationItem struct {
	Name      string  `json:"name"`
	TotalCost float64 `json:"totalCost"`
	CPUCost   float64 `json:"cpuCost"`
	RAMCost   float64 `json:"ramCost"`
}

// parseBaseURL validates a user-supplied base URL and returns a *url.URL whose
// Scheme and Host are guaranteed to be safe. Callers must construct final
// request URLs from the returned struct's fields (not from the raw input string)
// to satisfy CodeQL go/request-forgery: taint is broken at the struct boundary.
//
//   - Rejects non-http(s) schemes (prevents ftp://, file://, etc.)
//   - Rejects control characters (prevents header injection)
//   - Adds "http://" when the scheme is omitted
//   - Rewrites localhost → 127.0.0.1 (port-forward binds IPv4 only)
func parseBaseURL(raw string) (*url.URL, error) {
	u := strings.TrimSpace(raw)
	if u == "" {
		return nil, fmt.Errorf("empty URL")
	}
	if strings.ContainsAny(u, "\t\n\r") {
		return nil, fmt.Errorf("URL contains control characters")
	}
	if strings.Contains(u, "://") && !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		return nil, fmt.Errorf("URL scheme must be http or https, got %q", u)
	}
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		u = "http://" + u
	}
	u = strings.TrimRight(u, "/")
	parsed, err := url.Parse(u)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("invalid URL %q: %w", u, err)
	}
	if strings.ContainsAny(parsed.Host, " \t\n\r@") {
		return nil, fmt.Errorf("invalid host %q", parsed.Host)
	}
	if parsed.Hostname() == "localhost" {
		parsed.Host = strings.Replace(parsed.Host, "localhost", "127.0.0.1", 1)
	}
	return parsed, nil
}

// buildURL constructs a request URL from trusted parsed-URL components plus a
// fixed path and query string. Using struct fields (not the original input
// string) breaks the taint chain for CodeQL go/request-forgery.
func buildURL(base *url.URL, path string, q url.Values) string {
	u := &url.URL{
		Scheme:   base.Scheme,
		Host:     base.Host,
		Path:     strings.TrimSuffix(base.Path, "/") + path,
		RawQuery: q.Encode(),
	}
	return u.String()
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
	base, err := parseBaseURL(baseURL)
	if err != nil {
		return "", nil
	}
	probeQ := url.Values{}
	probeQ.Set("window", "1d")
	probeQ.Set("aggregate", "namespace")
	probeQ.Set("accumulate", "true")
	if probe(mustParseURL(buildURL(base, "/model/allocation", probeQ))) {
		return "kubecost", nil
	}
	if probe(mustParseURL(buildURL(base, "/allocation/compute", probeQ))) {
		return "opencost", nil
	}
	return "", nil
}

// mustParseURL parses a URL that was constructed internally from validated
// components. Panics only if our own buildURL produces an invalid URL, which
// indicates a programming error.
func mustParseURL(s string) *url.URL {
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
	base, err := parseBaseURL(baseURL)
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
	endpoint := buildURL(base, path, q)

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
		// Surface the first 120 chars of the body to help diagnose unexpected responses.
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
