package helm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/repo"
	"sigs.k8s.io/yaml"
)

// isSafeHelmIdentifier returns false if s contains characters that could cause
// path traversal when used as a component of a cache file path.
func isSafeHelmIdentifier(s string) bool {
	return s != "" &&
		!strings.ContainsAny(s, "/\\") &&
		!strings.Contains(s, "..") &&
		!strings.ContainsRune(s, 0)
}

// ChartEntry is one chart in search results.
type ChartEntry struct {
	Name        string `json:"name"`
	Repo        string `json:"repo"`
	Description string `json:"description"`
	Version     string `json:"version"`
	AppVersion  string `json:"appVersion"`
}

// SearchResult is the paginated response for /helm/repos/search.
type SearchResult struct {
	Charts []ChartEntry `json:"charts"`
	Total  int          `json:"total"`
}

// InstallRequest is the POST body for /helm/install.
type InstallRequest struct {
	Chart     string `json:"chart"`     // "repo/chart" format
	Version   string `json:"version"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Values    string `json:"values"`   // YAML string
	Context   string `json:"context"`  // kubeconfig context name; empty = kubeconfig default
}

// HelmRepoManager manages helm repository indices.
type HelmRepoManager struct {
	mu       sync.RWMutex
	settings *cli.EnvSettings
	indices  map[string]*repo.IndexFile // repoName → IndexFile
}

var (
	repoManagerOnce sync.Once
	repoManager     *HelmRepoManager
)

// GetRepoManager returns the package-level singleton HelmRepoManager.
func GetRepoManager() *HelmRepoManager {
	repoManagerOnce.Do(func() {
		repoManager = &HelmRepoManager{
			settings: cli.New(),
			indices:  make(map[string]*repo.IndexFile),
		}
		_ = repoManager.LoadIndices() // best-effort on startup
	})
	return repoManager
}

// helmCacheFileName returns the cache file name for a repo (mirrors helm's naming).
func helmCacheFileName(repoName string) string {
	return strings.ReplaceAll(repoName, "/", "-") + "-index.yaml"
}

// LoadIndices reads all cached repo index files from disk.
func (m *HelmRepoManager) LoadIndices() error {
	repoFile, err := repo.LoadFile(m.settings.RepositoryConfig)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, r := range repoFile.Repositories {
		indexPath := filepath.Join(m.settings.RepositoryCache, helmCacheFileName(r.Name))
		if _, err := os.Stat(indexPath); os.IsNotExist(err) {
			continue
		}
		idx, err := repo.LoadIndexFile(indexPath)
		if err != nil {
			continue
		}
		m.indices[r.Name] = idx
	}
	return nil
}

// ListRepos returns the configured repositories.
func (m *HelmRepoManager) ListRepos() ([]map[string]string, error) {
	repoFile, err := repo.LoadFile(m.settings.RepositoryConfig)
	if err != nil {
		if os.IsNotExist(err) {
			return []map[string]string{}, nil
		}
		return nil, err
	}

	var result []map[string]string
	for _, r := range repoFile.Repositories {
		result = append(result, map[string]string{
			"name": r.Name,
			"url":  r.URL,
		})
	}
	if result == nil {
		result = []map[string]string{}
	}
	return result, nil
}

// Search searches all loaded indices for charts matching query.
func (m *HelmRepoManager) Search(query string, limit, offset int) SearchResult {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var all []ChartEntry
	for repoName, idx := range m.indices {
		for chartName, versions := range idx.Entries {
			if len(versions) == 0 {
				continue
			}
			v := versions[0] // latest version
			fullName := repoName + "/" + chartName
			if query != "" {
				q := strings.ToLower(query)
				if !strings.Contains(strings.ToLower(fullName), q) &&
					!strings.Contains(strings.ToLower(v.Description), q) {
					continue
				}
			}
			all = append(all, ChartEntry{
				Name:        fullName,
				Repo:        repoName,
				Description: v.Description,
				Version:     v.Version,
				AppVersion:  v.AppVersion,
			})
		}
	}

	total := len(all)
	if offset >= total {
		return SearchResult{Charts: []ChartEntry{}, Total: total}
	}
	end := offset + limit
	if limit <= 0 || end > total {
		end = total
	}
	return SearchResult{Charts: all[offset:end], Total: total}
}

// GetVersions returns all available versions of a chart.
func (m *HelmRepoManager) GetVersions(repoName, chartName string) ([]ChartEntry, error) {
	for _, s := range []string{repoName, chartName} {
		if !isSafeHelmIdentifier(s) {
			return nil, fmt.Errorf("invalid Helm identifier %q: must not contain path separators or '..'", s)
		}
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	idx, ok := m.indices[repoName]
	if !ok {
		return nil, fmt.Errorf("repository %q not found or not loaded", repoName)
	}
	versions, ok := idx.Entries[chartName]
	if !ok {
		return nil, fmt.Errorf("chart %q not found in repository %q", chartName, repoName)
	}

	var result []ChartEntry
	for _, v := range versions {
		result = append(result, ChartEntry{
			Name:        repoName + "/" + chartName,
			Repo:        repoName,
			Description: v.Description,
			Version:     v.Version,
			AppVersion:  v.AppVersion,
		})
	}
	return result, nil
}

// GetValues fetches the default values.yaml for a specific chart version.
func (m *HelmRepoManager) GetValues(repoName, chartName, version string) (string, error) {
	for _, s := range []string{repoName, chartName, version} {
		if !isSafeHelmIdentifier(s) {
			return "", fmt.Errorf("invalid Helm identifier %q: must not contain path separators or '..'", s)
		}
	}

	m.mu.RLock()
	idx, ok := m.indices[repoName]
	m.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("repository %q not found", repoName)
	}

	versions, ok := idx.Entries[chartName]
	if !ok {
		return "", fmt.Errorf("chart %q not found", chartName)
	}

	// Find the requested version's download URL
	var chartURL string
	for _, v := range versions {
		if v.Version == version && len(v.URLs) > 0 {
			chartURL = v.URLs[0]
			break
		}
	}
	if chartURL == "" {
		return "", fmt.Errorf("version %q not found for chart %q", version, chartName)
	}

	// Make URL absolute if relative
	if !strings.HasPrefix(chartURL, "http://") && !strings.HasPrefix(chartURL, "https://") {
		repoFile, err := repo.LoadFile(m.settings.RepositoryConfig)
		if err != nil {
			return "", err
		}
		var repoURL string
		for _, r := range repoFile.Repositories {
			if r.Name == repoName {
				repoURL = r.URL
				break
			}
		}
		if repoURL == "" {
			return "", fmt.Errorf("repo URL not found for %q", repoName)
		}
		chartURL = strings.TrimSuffix(repoURL, "/") + "/" + chartURL
	}

	// Check local cache.
	// isSafeHelmIdentifier already rejected path separators and ".." above, but
	// filepath.Base each component at construction time so the path sanitizer is
	// explicit and visible to static analysis (CodeQL go/path-injection).
	cacheDir := filepath.Join(m.settings.RepositoryCache, "archive")
	cachePath := filepath.Join(cacheDir, fmt.Sprintf("%s-%s-%s.tgz",
		filepath.Base(repoName), filepath.Base(chartName), filepath.Base(version)))
	var chartData []byte
	if data, err := os.ReadFile(cachePath); err == nil {
		chartData = data
	} else {
		resp, err := http.Get(chartURL) //nolint:noctx
		if err != nil {
			return "", fmt.Errorf("downloading chart: %w", err)
		}
		defer resp.Body.Close()
		chartData, err = io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}
		// Cache to disk (best-effort)
		if mkErr := os.MkdirAll(cacheDir, 0755); mkErr == nil {
			_ = os.WriteFile(cachePath, chartData, 0644)
		}
	}

	// Load chart from archive and extract values.yaml
	chart, err := loader.LoadArchive(bytes.NewReader(chartData))
	if err != nil {
		return "", fmt.Errorf("loading chart archive: %w", err)
	}

	for _, f := range chart.Raw {
		if f.Name == "values.yaml" {
			return string(f.Data), nil
		}
	}
	return "# No values.yaml found in this chart\n", nil
}

// AddRepo adds a named Helm repository and downloads its index file.
func (m *HelmRepoManager) AddRepo(name, url string) error {
	if !isSafeHelmIdentifier(name) {
		return fmt.Errorf("invalid repo name: %q", name)
	}

	repoFile, err := repo.LoadFile(m.settings.RepositoryConfig)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		repoFile = repo.NewFile()
	}

	entry := &repo.Entry{Name: name, URL: url}
	getters := getter.All(m.settings)
	cr, err := repo.NewChartRepository(entry, getters)
	if err != nil {
		return fmt.Errorf("creating repo client: %w", err)
	}
	cr.CachePath = m.settings.RepositoryCache
	if _, err := cr.DownloadIndexFile(); err != nil {
		return fmt.Errorf("downloading index: %w", err)
	}

	repoFile.Update(entry)
	if err := repoFile.WriteFile(m.settings.RepositoryConfig, 0o600); err != nil {
		return fmt.Errorf("writing repo file: %w", err)
	}

	// Reload indices so the new repo is immediately searchable.
	return m.LoadIndices()
}

// Refresh re-downloads all repository index files.
// progress is called with each status message (may be nil).
func (m *HelmRepoManager) Refresh(progress func(msg string)) error {
	repoFile, err := repo.LoadFile(m.settings.RepositoryConfig)
	if err != nil {
		if os.IsNotExist(err) {
			if progress != nil {
				progress("No repositories configured")
			}
			return nil
		}
		return err
	}

	getters := getter.All(m.settings)
	for _, r := range repoFile.Repositories {
		if progress != nil {
			progress(fmt.Sprintf("Updating %s...", r.Name))
		}
		cr, err := repo.NewChartRepository(r, getters)
		if err != nil {
			if progress != nil {
				progress(fmt.Sprintf("Error creating repo client for %s: %v", r.Name, err))
			}
			continue
		}
		cr.CachePath = m.settings.RepositoryCache
		if _, err := cr.DownloadIndexFile(); err != nil {
			if progress != nil {
				progress(fmt.Sprintf("Error updating %s: %v", r.Name, err))
			}
			continue
		}
		if progress != nil {
			progress(fmt.Sprintf("Updated %s", r.Name))
		}
	}

	// Reload all indices from the freshly downloaded files
	return m.LoadIndices()
}

// Install installs a chart using helm's action library.
// progress is called with each status message (may be nil).
func (m *HelmRepoManager) Install(req InstallRequest, progress func(msg string)) error {
	settings := cli.New()
	// If a specific kubeconfig context was requested, point the Helm settings at it
	// so the install targets the cluster the user selected in Podscape — not whatever
	// context happens to be current in the kubeconfig file on disk.
	if req.Context != "" {
		settings.KubeContext = req.Context
	}
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), req.Namespace, os.Getenv("HELM_DRIVER"),
		func(format string, v ...interface{}) {
			if progress != nil {
				progress(fmt.Sprintf(format, v...))
			}
		}); err != nil {
		return err
	}

	installAction := action.NewInstall(actionConfig)
	installAction.ReleaseName = req.Name
	installAction.Namespace = req.Namespace
	installAction.Version = req.Version
	installAction.CreateNamespace = true

	// Validate chart name format (must be "repo/chart")
	parts := strings.SplitN(req.Chart, "/", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid chart name %q: expected repo/chart format", req.Chart)
	}

	if progress != nil {
		progress(fmt.Sprintf("Locating chart %s...", req.Chart))
	}
	chartPath, err := installAction.LocateChart(req.Chart, settings)
	if err != nil {
		return normalizeHelmError(err, req.Name, req.Namespace)
	}

	chart, err := loader.Load(chartPath)
	if err != nil {
		return normalizeHelmError(err, req.Name, req.Namespace)
	}

	// Parse provided values YAML
	var vals map[string]interface{}
	if req.Values != "" {
		if err := yaml.Unmarshal([]byte(req.Values), &vals); err != nil {
			return fmt.Errorf("invalid values YAML: %w", err)
		}
	}

	if progress != nil {
		progress(fmt.Sprintf("Installing %s as %s in namespace %s...", req.Chart, req.Name, req.Namespace))
	}

	rel, err := installAction.Run(chart, vals)
	if err != nil {
		return normalizeHelmError(err, req.Name, req.Namespace)
	}

	if progress != nil {
		progress(fmt.Sprintf("Successfully installed %s (revision %d)", rel.Name, rel.Version))
	}
	return nil
}

// normalizeHelmError converts helm errors into user-friendly messages.
func normalizeHelmError(err error, releaseName, namespace string) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	switch {
	case strings.Contains(msg, "already exists"):
		return fmt.Errorf("a release named %q already exists in namespace %q", releaseName, namespace)
	case strings.Contains(msg, "chart") && strings.Contains(msg, "not found"):
		return fmt.Errorf("chart not found in the repository")
	case strings.Contains(msg, "namespace") && strings.Contains(msg, "not found"):
		return fmt.Errorf("namespace %q does not exist", namespace)
	default:
		return err
	}
}

// InstallFromJSON unmarshals an InstallRequest from JSON and runs Install.
func InstallFromJSON(body []byte, progress func(msg string)) error {
	var req InstallRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return fmt.Errorf("invalid request: %w", err)
	}
	return GetRepoManager().Install(req, progress)
}
