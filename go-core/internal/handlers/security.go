package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	osexec "os/exec"
	"sync"
	"time"

	"github.com/controlplaneio/kubesec/v2/pkg/ruler"
	"go.uber.org/zap"
	"sigs.k8s.io/yaml"

	"github.com/podscape/go-core/internal/store"
)

// kubesecLogger is a package-level singleton so callers don't pay
// zap.NewProduction() allocation + defer logger.Sync() on every request.
var (
	kubesecSugar     *zap.SugaredLogger
	kubesecSugarOnce sync.Once
)

func getKubesecLogger() *zap.SugaredLogger {
	kubesecSugarOnce.Do(func() {
		l, _ := zap.NewProduction()
		kubesecSugar = l.Sugar()
	})
	return kubesecSugar
}

const trivyImageWorkers = 4

// KubesecIssue is a normalised kubesec finding we return to the frontend.
type KubesecIssue struct {
	ID       string `json:"id"`
	Reason   string `json:"reason"`
	Selector string `json:"selector"`
	Points   int    `json:"points"`
}

// KubesecBatchItem is the per-resource result in a batch scan.
type KubesecBatchItem struct {
	Score  int            `json:"score"`
	Issues []KubesecIssue `json:"issues"`
	Error  string         `json:"error,omitempty"`
}

const (
	kubesecMaxBatchSize = 500
	kubesecWorkers      = 8
)

func HandleSecurityScan(w http.ResponseWriter, r *http.Request) {
	// Check for trivy before setting SSE headers — return machine-readable 503
	// so the frontend can show a proper "install trivy" callout.
	if _, err := osexec.LookPath("trivy"); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "trivy_not_found",
			"message": "trivy binary not found in PATH. Install trivy to enable image vulnerability scanning.",
		})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// 30-minute hard cap; the per-image trivy timeout (5m) means a stalled
	// image never blocks the whole scan for more than a few minutes each.
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	store.Store.RUnlock()

	args := []string{
		"k8s",
		"--format", "json",
		"--report", "summary",
		"--timeout", "5m0s", // per-image scan timeout
	}
	if kubeconfig != "" {
		args = append(args, "--kubeconfig", kubeconfig)
	}
	args = append(args, "--exclude-namespaces", "kube-system,kube-node-lease,kube-public,local-path-storage,gatekeeper-system")

	cmd := osexec.CommandContext(ctx, "trivy", args...)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		sseEvent(w, flusher, "error", "failed to create stdout pipe: "+err.Error())
		return
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		sseEvent(w, flusher, "error", "failed to create stderr pipe: "+err.Error())
		return
	}

	if err := cmd.Start(); err != nil {
		sseEvent(w, flusher, "error", "failed to start trivy: "+err.Error())
		return
	}

	// Stream stderr as progress events concurrently with stdout reading.
	var stderrWg sync.WaitGroup
	stderrWg.Add(1)
	go func() {
		defer stderrWg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			if line := scanner.Text(); line != "" {
				sseEvent(w, flusher, "progress", line)
			}
		}
	}()

	output, readErr := io.ReadAll(stdoutPipe)
	stderrWg.Wait()
	waitErr := cmd.Wait()

	// Compact JSON before sending as SSE data — trivy outputs pretty-printed
	// JSON with newlines, which breaks SSE field parsing (newline = field separator).
	// Attempt compaction before checking the exit code: trivy exits non-zero
	// (exit status 1) when it finds vulnerabilities, so valid JSON output
	// takes priority over a non-zero exit code.
	var compacted bytes.Buffer
	if jsonErr := json.Compact(&compacted, output); jsonErr == nil {
		sseEvent(w, flusher, "result", compacted.String())
		return
	}

	if readErr != nil || waitErr != nil {
		msg := "trivy scan failed"
		if waitErr != nil {
			msg = waitErr.Error()
		}
		sseEvent(w, flusher, "error", msg)
		return
	}

	// No JSON and no error: send raw output.
	sseEvent(w, flusher, "result", string(output))
}

func HandleKubesec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	// Use kubesec Go package directly
	sugar := getKubesecLogger()

	schemaConfig := ruler.NewDefaultSchemaConfig()
	schemaConfig.DisableValidation = true // Resources from cluster

	reports, err := ruler.NewRuleset(sugar).Run("Podscape", body, schemaConfig)
	if err != nil {
		http.Error(w, "Kubesec scan failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reports)
}

// HandleKubesecBatch accepts a JSON array of Kubernetes resource objects,
// runs kubesec on each concurrently, and returns a parallel array of KubesecBatchItem.
// Resources that fail individually return an error string without aborting the rest.
// Batch is capped at 500 resources; the whole scan times out after 2 minutes.
func HandleKubesecBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	var resources []json.RawMessage
	if err := json.Unmarshal(body, &resources); err != nil {
		http.Error(w, "invalid JSON array: "+err.Error(), http.StatusBadRequest)
		return
	}

	if len(resources) > kubesecMaxBatchSize {
		http.Error(w, fmt.Sprintf("batch too large: max %d resources", kubesecMaxBatchSize), http.StatusRequestEntityTooLarge)
		return
	}

	if len(resources) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	sugar := getKubesecLogger()

	schemaConfig := ruler.NewDefaultSchemaConfig()
	schemaConfig.DisableValidation = true

	results := make([]KubesecBatchItem, len(resources))

	// Dispatch work indices over a channel; each goroutine owns its own ruleset
	// (ruler.Ruleset is not goroutine-safe) and writes into a pre-allocated slice
	// at the given index — no two goroutines share an index.
	work := make(chan int, len(resources))
	for i := range resources {
		work <- i
	}
	close(work)

	numWorkers := kubesecWorkers
	if len(resources) < numWorkers {
		numWorkers = len(resources)
	}

	var wg sync.WaitGroup
	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			localRuleset := ruler.NewRuleset(sugar)
			for i := range work {
				select {
				case <-ctx.Done():
					results[i] = KubesecBatchItem{Error: "timeout"}
					continue
				default:
				}

				yamlBytes, err := yaml.JSONToYAML(resources[i])
				if err != nil {
					results[i] = KubesecBatchItem{Error: "json→yaml: " + err.Error()}
					continue
				}

				reports, err := localRuleset.Run("Podscape", yamlBytes, schemaConfig)
				if err != nil || len(reports) == 0 {
					msg := "no report"
					if err != nil {
						msg = err.Error()
					}
					results[i] = KubesecBatchItem{Error: msg}
					continue
				}

				rep := reports[0]
				item := KubesecBatchItem{Score: rep.Score}
				for _, a := range rep.Scoring.Advise {
					item.Issues = append(item.Issues, KubesecIssue{
						ID:       a.ID,
						Reason:   a.Reason,
						Selector: a.Selector,
						Points:   a.Points,
					})
				}
				results[i] = item
			}
		}()
	}
	wg.Wait()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func HandleTrivyImages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Workloads []struct {
			Image     string `json:"image"`
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
			Kind      string `json:"kind"`
		} `json:"workloads"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Workloads) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"Resources": []interface{}{}})
		return
	}

	if _, err := osexec.LookPath("trivy"); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "trivy_not_found",
			"message": "trivy binary not found in PATH. Install with: brew install trivy",
		})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Minute)
	defer cancel()

	// Deduplicate by image tag; preserve workload→image mapping.
	type wlEntry struct {
		name, namespace, kind string
	}
	imageWorkloads := make(map[string][]wlEntry)
	var imageOrder []string
	seen := make(map[string]bool)
	for _, wl := range req.Workloads {
		if wl.Image == "" {
			continue
		}
		if !seen[wl.Image] {
			seen[wl.Image] = true
			imageOrder = append(imageOrder, wl.Image)
		}
		imageWorkloads[wl.Image] = append(imageWorkloads[wl.Image], wlEntry{
			name:      wl.Name,
			namespace: wl.Namespace,
			kind:      wl.Kind,
		})
	}

	type resourceEntry struct {
		Namespace string        `json:"Namespace"`
		Kind      string        `json:"Kind"`
		Name      string        `json:"Name"`
		Results   []interface{} `json:"Results"`
	}

	// Scan up to trivyImageWorkers images concurrently. Results are stored in
	// a slice indexed by imageOrder position so the final output is deterministic.
	// SSE events (progress/error) require serialization because http.ResponseWriter
	// is not safe for concurrent use.
	perImageResults := make([][]resourceEntry, len(imageOrder))
	var sseMu sync.Mutex
	sendSSE := func(eventType, data string) {
		sseMu.Lock()
		sseEvent(w, flusher, eventType, data)
		sseMu.Unlock()
	}

	sem := make(chan struct{}, trivyImageWorkers)
	var wg sync.WaitGroup
	for i, image := range imageOrder {
		wg.Add(1)
		go func(idx int, img string) {
			defer wg.Done()
			select {
			case <-ctx.Done():
				return
			case sem <- struct{}{}:
			}
			defer func() { <-sem }()

			sendSSE("progress", fmt.Sprintf("[%d/%d] Scanning %s", idx+1, len(imageOrder), img))

			cmd := osexec.CommandContext(ctx, "trivy", "image", "--format", "json", "--timeout", "10m0s", "--quiet", img)
			output, err := cmd.Output()
			// cmd.Output() returns stdout even on non-zero exit; trivy exits 1 when
			// vulnerabilities are found but still emits valid JSON. Only skip the
			// image if there is no output to parse.
			if err != nil && len(output) == 0 {
				sendSSE("progress", fmt.Sprintf("Skipping %s: %s", img, err.Error()))
				return
			}

			var trivyOut map[string]interface{}
			if jsonErr := json.Unmarshal(output, &trivyOut); jsonErr != nil {
				sendSSE("progress", fmt.Sprintf("Skipping %s: failed to parse result", img))
				return
			}

			var imageResults []interface{}
			if results, ok := trivyOut["Results"].([]interface{}); ok {
				imageResults = results
			}

			var entries []resourceEntry
			for _, wl := range imageWorkloads[img] {
				entries = append(entries, resourceEntry{
					Namespace: wl.namespace,
					Kind:      wl.kind,
					Name:      wl.name,
					Results:   imageResults,
				})
			}
			perImageResults[idx] = entries
		}(i, image)
	}
	wg.Wait()

	// Flatten per-image results in imageOrder order so output is stable.
	var resources []resourceEntry
	for _, entries := range perImageResults {
		resources = append(resources, entries...)
	}

	resultJSON, err := json.Marshal(map[string]interface{}{"Resources": resources})
	if err != nil {
		sendSSE("error", "failed to marshal results: "+err.Error())
		return
	}
	sendSSE("result", string(resultJSON))
}
