package prometheus

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/podscape/go-core/internal/store"
)

// QueryRequest is a single query within a batch.
type QueryRequest struct {
	Query string `json:"query"`
	Label string `json:"label"`
}

// BatchQueryRequest is the POST body for /prometheus/query_range_batch.
type BatchQueryRequest struct {
	Queries   []QueryRequest `json:"queries"`
	StartTime int64          `json:"start"` // unix seconds
	EndTime   int64          `json:"end"`   // unix seconds
}

// DataPoint is a single [timestamp, value] observation.
type DataPoint struct {
	Timestamp int64   `json:"t"`
	Value     float64 `json:"v"`
}

// QueryResult is the result for one named series.
type QueryResult struct {
	Label  string      `json:"label"`
	Points []DataPoint `json:"points"`
	Error  string      `json:"error,omitempty"`
}

type cacheEntry struct {
	result    []DataPoint
	expiresAt time.Time
	err       error
}

var (
	queryCache  sync.Map // cacheKey string → *cacheEntry
	manualURL   string
	manualURLMu sync.RWMutex
)

// candidate is a well-known Prometheus service location.
type candidate struct{ ns, svc, port string }

var defaultCandidates = []candidate{
	// prometheus-community/prometheus chart
	{"monitoring", "prometheus-server", "80"},
	// kube-prometheus-stack (most common)
	{"monitoring", "kube-prometheus-stack-prometheus", "9090"},
	{"monitoring", "prometheus-operated", "9090"},
	// plain prometheus service names
	{"monitoring", "prometheus", "9090"},
	{"prometheus", "prometheus", "9090"},
	// Rancher monitoring
	{"cattle-monitoring-system", "rancher-monitoring-prometheus", "9090"},
	// fallback
	{"default", "prometheus", "9090"},
}

// normalizeURL ensures the URL has a scheme and no trailing slash.
// Returns the normalized URL or an error if the result is invalid.
func normalizeURL(u string) (string, error) {
	u = strings.TrimSpace(u)
	if u == "" {
		return "", fmt.Errorf("empty URL")
	}
	// Reject non-http(s) schemes before adding a default scheme. This prevents
	// ftp://, file://, gopher:// and similar from being silently rewritten to
	// "http://ftp://..." and avoids CodeQL go/request-forgery.
	if strings.Contains(u, "://") && !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		return "", fmt.Errorf("URL scheme must be http or https, got %q", u)
	}
	// Add http:// scheme if the user omitted it.
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		u = "http://" + u
	}
	// Strip trailing slash so concatenation with /api/v1/... is always clean.
	u = strings.TrimRight(u, "/")
	// Validate the result is a parseable URL with a host.
	parsed, err := url.Parse(u)
	if err != nil || parsed.Host == "" {
		return "", fmt.Errorf("invalid URL %q: %w", u, err)
	}
	// Rewrite localhost → 127.0.0.1 to avoid Go resolving it to [::1] (IPv6)
	// while kubectl port-forward only listens on 127.0.0.1 (IPv4).
	if parsed.Hostname() == "localhost" {
		parsed.Host = strings.Replace(parsed.Host, "localhost", "127.0.0.1", 1)
		u = parsed.String()
	}
	return u, nil
}

// kubeSvcRef is the parsed components of a k8s service DNS name.
type kubeSvcRef struct {
	namespace string
	service   string
	port      string
}

// parseKubeSvcURL detects URLs whose host matches the in-cluster DNS pattern
// <service>.<namespace>.svc[.cluster.local] and returns the extracted ref.
// Returns nil when the URL is not a k8s service DNS name.
func parseKubeSvcURL(rawURL string) *kubeSvcRef {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil
	}
	host := u.Hostname()
	port := u.Port()

	// Only match if the host actually has a k8s in-cluster DNS suffix.
	stripped := false
	for _, suffix := range []string{".svc.cluster.local", ".svc"} {
		if strings.HasSuffix(host, suffix) {
			host = strings.TrimSuffix(host, suffix)
			stripped = true
			break
		}
	}
	if !stripped {
		return nil
	}

	// After stripping, host must be exactly "<service>.<namespace>".
	parts := strings.SplitN(host, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil
	}

	// Default port based on scheme.
	if port == "" {
		if u.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	return &kubeSvcRef{service: parts[0], namespace: parts[1], port: port}
}

// ClearCache drops all cached query results. Call on context switch so stale
// results from the previous cluster are never served to the new one.
func ClearCache() {
	queryCache.Range(func(k, _ any) bool { queryCache.Delete(k); return true })
}

// SetManualURL configures a manual Prometheus base URL (e.g. "http://prometheus.example.com").
// When set, direct HTTP calls are used instead of the k8s service proxy.
// The URL is normalized (scheme added if missing, trailing slash stripped).
// In-cluster DNS names (*.svc.cluster.local) are automatically routed via the k8s API proxy.
// Returns an error if the URL is malformed or uses a non-http(s) scheme.
func SetManualURL(u string) error {
	manualURLMu.Lock()
	defer manualURLMu.Unlock()
	if u == "" {
		manualURL = ""
		return nil
	}
	normalized, err := normalizeURL(u)
	if err != nil {
		manualURL = ""
		return err
	}
	manualURL = normalized
	return nil
}

func getManualURL() string {
	manualURLMu.RLock()
	defer manualURLMu.RUnlock()
	return manualURL
}

// ProbeResult is returned by ProbePrometheus with both the availability flag and a
// human-readable reason for display in the Settings panel.
type ProbeResult struct {
	Available bool   `json:"available"`
	Error     string `json:"error,omitempty"`
}

// ProbePrometheus checks whether Prometheus is reachable.
// Tries a manual URL first (if configured), then k8s service proxy candidates.
// If the manual URL is a k8s in-cluster DNS name (*.svc.cluster.local), the k8s
// API service proxy is used automatically — no port-forwarding needed.
func ProbePrometheus() ProbeResult {
	if mu := getManualURL(); mu != "" {
		// In-cluster DNS? Route through k8s API proxy transparently.
		if ref := parseKubeSvcURL(mu); ref != nil {
			cs, _ := store.Store.ActiveClientset()
			if cs == nil {
				return ProbeResult{Error: "no active Kubernetes context"}
			}
			ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
			raw, err := cs.CoreV1().Services(ref.namespace).ProxyGet(
				"http", ref.service, ref.port, "/api/v1/query", map[string]string{"query": "up"},
			).DoRaw(ctx)
			cancel()
			if err != nil {
				msg := err.Error()
				var hint string
				switch {
				case strings.Contains(msg, "context deadline exceeded") || strings.Contains(msg, "timeout"):
					hint = " -- k8s API proxy cannot reach pod IPs (EKS/GKE control-plane network). Use: kubectl port-forward svc/" + ref.service + " 9090:9090 -n " + ref.namespace + " then set URL to http://localhost:9090"
				case strings.Contains(msg, "no endpoints"):
					hint = " -- service has no ready endpoints (are Prometheus pods running?)"
				case strings.Contains(msg, "not found"):
					hint = " -- service not found; check namespace/name, or leave URL blank for auto-discovery"
				case strings.Contains(msg, "Forbidden") || strings.Contains(msg, "forbidden"):
					hint = " -- RBAC: kubeconfig user lacks get permission on services/proxy"
				}
				return ProbeResult{Error: fmt.Sprintf("k8s proxy to %s/%s:%s failed: %v%s", ref.namespace, ref.service, ref.port, err, hint)}
			}
			var result struct {
				Status string `json:"status"`
			}
			if json.Unmarshal(raw, &result) == nil && result.Status == "success" {
				return ProbeResult{Available: true}
			}
			snippet := string(raw)
			if len(snippet) > 200 {
				snippet = snippet[:200] + "…"
			}
			return ProbeResult{Error: fmt.Sprintf("unexpected response from %s/%s:%s — %s", ref.namespace, ref.service, ref.port, snippet)}
		}

		// Direct HTTP request (external or localhost URL).
		// Re-parse mu and validate the scheme explicitly at this call site so the
		// taint barrier is visible to CodeQL. The path is a constant — only the
		// validated scheme and host come from the user-supplied value.
		parsedMu, err := url.Parse(mu)
		if err != nil || parsedMu.Host == "" ||
			(parsedMu.Scheme != "http" && parsedMu.Scheme != "https") {
			return ProbeResult{Error: fmt.Sprintf("invalid Prometheus URL: %v", err)}
		}
		probeURL := &url.URL{
			Scheme:   parsedMu.Scheme,
			Host:     parsedMu.Host,
			Path:     "/api/v1/query",
			RawQuery: "query=up",
		}
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", probeURL.String(), nil)
		if err != nil {
			return ProbeResult{Error: fmt.Sprintf("invalid URL: %v", err)}
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return ProbeResult{Error: fmt.Sprintf("connection failed: %v", err)}
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 200 {
			return ProbeResult{Error: fmt.Sprintf("HTTP %d from %s", resp.StatusCode, mu)}
		}
		var result struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(body, &result) != nil || result.Status != "success" {
			return ProbeResult{Error: fmt.Sprintf("unexpected response from %s (not a Prometheus API)", mu)}
		}
		return ProbeResult{Available: true}
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		return ProbeResult{Error: "no active Kubernetes context"}
	}

	for _, c := range defaultCandidates {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		raw, err := cs.CoreV1().Services(c.ns).ProxyGet(
			"http", c.svc, c.port, "/api/v1/query", map[string]string{"query": "up"},
		).DoRaw(ctx)
		cancel()
		if err != nil {
			continue
		}
		var result struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(raw, &result) == nil && result.Status == "success" {
			return ProbeResult{Available: true}
		}
	}

	// Last resort: check common localhost ports for an active port-forward.
	// This handles cloud clusters (EKS/GKE/AKS) where the k8s API proxy cannot
	// reach pod IPs — the user just needs to create a port-forward in the app.
	for _, port := range []int{9090, 9091, 8080} {
		if probeLocalPort(port) {
			return ProbeResult{Available: true}
		}
	}
	return ProbeResult{Error: "not found via k8s service proxy or localhost (9090/9091/8080) — create a port-forward to Prometheus in the Port Forwards panel, then hit Detect Now"}
}

// probeLocalPort checks whether a Prometheus instance is listening on 127.0.0.1:port.
// Verifies the response body is a valid Prometheus API success response, not just any
// HTTP 200 (which would cause false positives from dev servers, metrics endpoints, etc.).
func probeLocalPort(port int) bool {
	u := fmt.Sprintf("http://127.0.0.1:%d/api/v1/query?query=up", port)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		return false
	}
	var result struct {
		Status string `json:"status"`
	}
	return json.Unmarshal(body, &result) == nil && result.Status == "success"
}

// QueryRangeBatch executes multiple Prometheus query_range calls in parallel.
func QueryRangeBatch(req BatchQueryRequest) []QueryResult {
	if req.EndTime == 0 {
		req.EndTime = time.Now().Unix()
	}
	if req.StartTime == 0 {
		req.StartTime = req.EndTime - 3600
	}
	duration := req.EndTime - req.StartTime
	step := duration / 300
	if step < 15 {
		step = 15
	}

	results := make([]QueryResult, len(req.Queries))
	var wg sync.WaitGroup
	for i, q := range req.Queries {
		wg.Add(1)
		go func(idx int, qr QueryRequest) {
			defer wg.Done()
			points, err := queryRangeSingle(qr.Query, req.StartTime, req.EndTime, step)
			if err != nil {
				results[idx] = QueryResult{Label: qr.Label, Points: []DataPoint{}, Error: err.Error()}
			} else {
				if points == nil {
					points = []DataPoint{}
				}
				results[idx] = QueryResult{Label: qr.Label, Points: points}
			}
		}(i, q)
	}
	wg.Wait()
	return results
}

func queryRangeSingle(query string, start, end, step int64) ([]DataPoint, error) {
	cacheKey := fmt.Sprintf("%s|%d|%d|%d", query, start, end, step)
	if entry, ok := queryCache.Load(cacheKey); ok {
		e := entry.(*cacheEntry)
		if time.Now().Before(e.expiresAt) {
			return e.result, e.err
		}
	}

	raw, fetchErr := fetchQueryRange(query, start, end, step)
	var points []DataPoint
	if fetchErr == nil {
		var parseErr error
		points, parseErr = parseRangeResult(raw)
		if parseErr != nil {
			fetchErr = parseErr
		}
	}

	ttl := 30 * time.Second
	if fetchErr != nil {
		ttl = 5 * time.Second
	}
	queryCache.Store(cacheKey, &cacheEntry{
		result:    points,
		err:       fetchErr,
		expiresAt: time.Now().Add(ttl),
	})
	return points, fetchErr
}

func fetchQueryRange(query string, start, end, step int64) ([]byte, error) {
	stepStr := strconv.FormatInt(step, 10) + "s"
	startStr := strconv.FormatInt(start, 10)
	endStr := strconv.FormatInt(end, 10)

	if mu := getManualURL(); mu != "" {
		kvParams := map[string]string{
			"query": query,
			"start": startStr,
			"end":   endStr,
			"step":  stepStr,
		}

		// In-cluster DNS? Route through k8s API proxy transparently.
		if ref := parseKubeSvcURL(mu); ref != nil {
			cs, _ := store.Store.ActiveClientset()
			if cs == nil {
				return nil, fmt.Errorf("no active kubernetes clientset")
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			raw, err := cs.CoreV1().Services(ref.namespace).ProxyGet(
				"http", ref.service, ref.port, "/api/v1/query_range", kvParams,
			).DoRaw(ctx)
			cancel()
			return raw, err
		}

		// Direct HTTP request.
		// Re-parse mu and validate the scheme explicitly at this call site so the
		// taint barrier is visible to CodeQL. The path is a constant — only the
		// validated scheme and host come from the user-supplied value.
		parsedMu, err := url.Parse(mu)
		if err != nil || parsedMu.Host == "" ||
			(parsedMu.Scheme != "http" && parsedMu.Scheme != "https") {
			return nil, fmt.Errorf("invalid Prometheus URL: %w", err)
		}
		rangeURL := &url.URL{
			Scheme: parsedMu.Scheme,
			Host:   parsedMu.Host,
			Path:   "/api/v1/query_range",
			RawQuery: url.Values{
				"query": {query},
				"start": {startStr},
				"end":   {endStr},
				"step":  {stepStr},
			}.Encode(),
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", rangeURL.String(), nil)
		if err != nil {
			return nil, err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		return io.ReadAll(resp.Body)
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		return nil, fmt.Errorf("no active kubernetes clientset")
	}

	params := map[string]string{
		"query": query,
		"start": startStr,
		"end":   endStr,
		"step":  stepStr,
	}
	for _, c := range defaultCandidates {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		raw, err := cs.CoreV1().Services(c.ns).ProxyGet(
			"http", c.svc, c.port, "/api/v1/query_range", params,
		).DoRaw(ctx)
		cancel()
		if err == nil {
			return raw, nil
		}
	}

	// Fallback: try localhost port-forwards (for EKS/GKE/AKS where k8s proxy can't reach pods).
	qv := url.Values{"query": {query}, "start": {startStr}, "end": {endStr}, "step": {stepStr}}
	for _, port := range []int{9090, 9091, 8080} {
		u := fmt.Sprintf("http://127.0.0.1:%d/api/v1/query_range?%s", port, qv.Encode())
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
		if err != nil {
			cancel()
			continue
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			cancel()
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		cancel()
		if resp.StatusCode == 200 {
			return body, nil
		}
	}
	return nil, fmt.Errorf("prometheus not reachable via k8s service proxy or localhost — create a port-forward in the Port Forwards panel")
}

func parseRangeResult(raw []byte) ([]DataPoint, error) {
	var resp struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Values [][]interface{} `json:"values"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("parsing prometheus response: %w", err)
	}
	if resp.Status != "success" {
		return nil, fmt.Errorf("prometheus returned status %q", resp.Status)
	}
	var points []DataPoint
	for _, r := range resp.Data.Result {
		for _, v := range r.Values {
			if len(v) != 2 {
				continue
			}
			ts, ok := v[0].(float64)
			if !ok {
				continue
			}
			valStr, ok := v[1].(string)
			if !ok {
				continue
			}
			val, err := strconv.ParseFloat(valStr, 64)
			if err != nil {
				continue
			}
			points = append(points, DataPoint{Timestamp: int64(ts), Value: val})
		}
	}
	return points, nil
}
