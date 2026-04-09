package helm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	semver "github.com/Masterminds/semver/v3"
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
	Name        string   `json:"name"`
	Repo        string   `json:"repo"`
	Description string   `json:"description"`
	Version     string   `json:"version"`
	AppVersion  string   `json:"appVersion"`
	Home        string   `json:"home,omitempty"`
	Sources     []string `json:"sources,omitempty"`
	Keywords    []string `json:"keywords,omitempty"`
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
	// Logic moved to getIndex (lazy loading) to save memory
	return nil
}

// getIndex returns a cached index for the repo, loading it from disk if needed.
func (m *HelmRepoManager) getIndex(repoName string) (*repo.IndexFile, error) {
	m.mu.RLock()
	idx, ok := m.indices[repoName]
	m.mu.RUnlock()
	if ok {
		return idx, nil
	}

	// Load from disk
	m.mu.Lock()
	defer m.mu.Unlock()

	// Double check
	if idx, ok := m.indices[repoName]; ok {
		return idx, nil
	}

	indexPath := filepath.Join(m.settings.RepositoryCache, helmCacheFileName(repoName))
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("index not found for repo %s: try refreshing", repoName)
	}

	idx, err := repo.LoadIndexFile(indexPath)
	if err != nil {
		return nil, err
	}
	m.indices[repoName] = idx
	return idx, nil
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
	var all []ChartEntry
	
	repoFile, err := repo.LoadFile(m.settings.RepositoryConfig)
	if err != nil {
		return SearchResult{Charts: []ChartEntry{}, Total: 0}
	}

	for _, r := range repoFile.Repositories {
		idx, err := m.getIndex(r.Name)
		if err != nil {
			continue
		}
		repoName := r.Name
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
				Home:        v.Home,
				Sources:     v.Sources,
				Keywords:    v.Keywords,
			})
		}
	}

	// Sort results to ensure deterministic ordering (avoids map iteration randomness).
	sort.Slice(all, func(i, j int) bool {
		if all[i].Name != all[j].Name {
			return all[i].Name < all[j].Name
		}
		// Use proper semver comparison for version consistency
		return compareVersions(all[i].Version, all[j].Version) > 0
	})

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

	idx, err := m.getIndex(repoName)
	if err != nil {
		return nil, err
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
			Home:        v.Home,
			Sources:     v.Sources,
			Keywords:    v.Keywords,
		})
	}
	
	// Sort versions descending
	sort.Slice(result, func(i, j int) bool {
		return compareVersions(result[i].Version, result[j].Version) > 0
	})
	
	return result, nil
}

func compareVersions(v1, v2 string) int {
	sv1, err1 := semver.NewVersion(v1)
	sv2, err2 := semver.NewVersion(v2)
	if err1 != nil || err2 != nil {
		return strings.Compare(v1, v2)
	}
	return sv1.Compare(sv2)
}

// LatestVersion returns the globally highest semver version of a chart across
// all loaded repo indices. chartName is the bare chart name without repo prefix
// (e.g. "nginx", not "bitnami/nginx").
//
// If multiple repos carry the chart, the one with the highest semver wins.
// If a version string cannot be parsed as semver, it is skipped for comparison
// purposes; if ALL candidates fail to parse, the raw version string from the
// first matched entry is returned as a fallback.
//
// Returns found=false when no repo contains a chart with that name.
func (m *HelmRepoManager) LatestVersion(chartName string) (version, fullName string, found bool) {
	repoFile, err := repo.LoadFile(m.settings.RepositoryConfig)
	if err != nil {
		return "", "", false
	}

	var bestVer *semver.Version
	var bestRaw, bestFull string
	var fallbackRaw, fallbackFull string
	hasFallback := false

	for _, r := range repoFile.Repositories {
		idx, err := m.getIndex(r.Name)
		if err != nil {
			continue
		}
		repoName := r.Name
		for entryName, versionList := range idx.Entries {
			if len(versionList) == 0 {
				continue
			}
			if entryName != chartName {
				continue
			}
			full := repoName + "/" + entryName
			
			// Strictly identify the latest CHART version in this repo using semver.
			var repoBestVer *semver.Version
			var repoBestRaw string
			
			for _, ver := range versionList {
				raw := ver.Metadata.Version
				v, err := semver.NewVersion(raw)
				if err != nil {
					continue
				}
				if repoBestVer == nil || v.GreaterThan(repoBestVer) {
					repoBestVer = v
					repoBestRaw = raw
				}
			}

			// If no semver versions found, fall back to the first entry's version.
			if repoBestVer == nil && !hasFallback {
				fallbackRaw = versionList[0].Metadata.Version
				fallbackFull = full
				hasFallback = true
				continue
			}

			if repoBestVer != nil {
				if bestVer == nil || repoBestVer.GreaterThan(bestVer) {
					bestVer = repoBestVer
					bestRaw = repoBestRaw
					bestFull = full
				}
			}
		}
	}

	if bestVer != nil {
		return bestRaw, bestFull, true
	}
	if hasFallback {
		// All versions were unparseable — return raw string from first match
		return fallbackRaw, fallbackFull, true
	}
	return "", "", false
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
		normErr := normalizeHelmError(err, req.Name, req.Namespace)
		// Resources exist outside Helm (e.g. installed via kubectl). Retry
		// as a forced upgrade-or-install so Helm takes ownership.
		if isOwnershipConflict(err) {
			if progress != nil {
				progress("Resources exist outside Helm — retrying as upgrade --install --force…")
			}
			upgradeAction := action.NewUpgrade(actionConfig)
			upgradeAction.Install = true
			upgradeAction.Force = true
			upgradeAction.Namespace = req.Namespace
			upgradeAction.Version = req.Version
			upgradeAction.ReuseValues = false
			rel2, err2 := upgradeAction.Run(req.Name, chart, vals)
			if err2 != nil {
				return normalizeHelmError(err2, req.Name, req.Namespace)
			}
			if progress != nil {
				progress(fmt.Sprintf("Successfully installed %s (revision %d)", rel2.Name, rel2.Version))
			}
			return nil
		}
		return normErr
	}

	if progress != nil {
		progress(fmt.Sprintf("Successfully installed %s (revision %d)", rel.Name, rel.Version))
	}
	return nil
}

// isOwnershipConflict reports whether the Helm error is the "resource exists
// but is not owned by Helm" class of error (missing managed-by label /
// release annotations).
func isOwnershipConflict(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "cannot be imported into the current release") ||
		strings.Contains(msg, "invalid ownership metadata") ||
		strings.Contains(msg, `missing key "app.kubernetes.io/managed-by"`)
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
