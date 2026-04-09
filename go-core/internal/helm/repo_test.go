package helm

import (
	"strings"
	"testing"

	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/repo"
)

func TestNormalizeHelmError_AlreadyExists(t *testing.T) {
	err := normalizeHelmError(&stubError{"release already exists"}, "myapp", "default")
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if !strings.Contains(err.Error(), "myapp") {
		t.Errorf("expected error to mention release name, got: %s", err.Error())
	}
	if !strings.Contains(err.Error(), "default") {
		t.Errorf("expected error to mention namespace, got: %s", err.Error())
	}
}

func TestNormalizeHelmError_ChartNotFound(t *testing.T) {
	err := normalizeHelmError(&stubError{"chart not found"}, "rel", "ns")
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "chart") {
		t.Errorf("expected chart-related message, got: %s", err.Error())
	}
}

func TestNormalizeHelmError_NamespaceNotFound(t *testing.T) {
	err := normalizeHelmError(&stubError{"namespace not found"}, "rel", "missing-ns")
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if !strings.Contains(err.Error(), "missing-ns") {
		t.Errorf("expected error to mention namespace, got: %s", err.Error())
	}
}

func TestNormalizeHelmError_Nil(t *testing.T) {
	if normalizeHelmError(nil, "rel", "ns") != nil {
		t.Error("expected nil error for nil input")
	}
}

func TestNormalizeHelmError_UnknownPassthrough(t *testing.T) {
	orig := &stubError{"something completely different"}
	err := normalizeHelmError(orig, "rel", "ns")
	if err.Error() != orig.Error() {
		t.Error("expected unknown errors to pass through unchanged")
	}
}

func TestSearch_EmptyIndex_ReturnsEmpty(t *testing.T) {
	m := &HelmRepoManager{
		indices: make(map[string]*repo.IndexFile),
	}
	result := m.Search("", 20, 0)
	if result.Total != 0 {
		t.Errorf("expected total=0 on empty index, got %d", result.Total)
	}
	if len(result.Charts) != 0 {
		t.Errorf("expected 0 charts on empty index, got %d", len(result.Charts))
	}
}

func TestSearch_Pagination(t *testing.T) {
	m := &HelmRepoManager{
		indices: map[string]*repo.IndexFile{
			"myrepo": {
				Entries: map[string]repo.ChartVersions{
					"alpha": {{Metadata: &chart.Metadata{Name: "alpha", Version: "1.0", AppVersion: "1.0"}}},
					"beta":  {{Metadata: &chart.Metadata{Name: "beta", Version: "2.0", AppVersion: "2.0"}}},
					"gamma": {{Metadata: &chart.Metadata{Name: "gamma", Version: "3.0", AppVersion: "3.0"}}},
				},
			},
		},
	}

	r := m.Search("", 2, 0)
	if r.Total != 3 {
		t.Errorf("expected total=3, got %d", r.Total)
	}
	if len(r.Charts) != 2 {
		t.Errorf("expected 2 charts (limit), got %d", len(r.Charts))
	}

	// Offset beyond total
	r2 := m.Search("", 2, 10)
	if len(r2.Charts) != 0 {
		t.Errorf("expected 0 charts when offset > total, got %d", len(r2.Charts))
	}
}

func TestSearch_QueryFilter(t *testing.T) {
	m := &HelmRepoManager{
		indices: map[string]*repo.IndexFile{
			"repo": {
				Entries: map[string]repo.ChartVersions{
					"nginx":    {{Metadata: &chart.Metadata{Name: "nginx", Version: "1.0", Description: "Web server"}}},
					"postgres": {{Metadata: &chart.Metadata{Name: "postgres", Version: "1.0", Description: "Database"}}},
				},
			},
		},
	}

	r := m.Search("nginx", 20, 0)
	if r.Total != 1 {
		t.Errorf("expected 1 result for 'nginx' query, got %d", r.Total)
	}
	if r.Charts[0].Name != "repo/nginx" {
		t.Errorf("unexpected chart name: %s", r.Charts[0].Name)
	}
}

func TestSearch_DescriptionFilter(t *testing.T) {
	m := &HelmRepoManager{
		indices: map[string]*repo.IndexFile{
			"repo": {
				Entries: map[string]repo.ChartVersions{
					"myapp": {{Metadata: &chart.Metadata{Name: "myapp", Version: "1.0", Description: "A fancy web server"}}},
					"other": {{Metadata: &chart.Metadata{Name: "other", Version: "1.0", Description: "Database engine"}}},
				},
			},
		},
	}

	r := m.Search("fancy", 20, 0)
	if r.Total != 1 {
		t.Errorf("expected 1 result matching description, got %d", r.Total)
	}
}

// ── Security: path injection — GetValues must reject traversal inputs ─────────

func TestGetValues_PathTraversalInputs_AreRejected(t *testing.T) {
	cases := []struct {
		name      string
		repoName  string
		chartName string
		version   string
	}{
		{"dotdot in repo name", "../evil", "chart", "1.0.0"},
		{"dotdot in chart name", "repo", "../../etc", "1.0.0"},
		{"dotdot in version", "repo", "chart", "../bad"},
		{"slash in repo name", "path/traversal", "chart", "1.0.0"},
		{"backslash in chart name", "repo", `back\slash`, "1.0.0"},
		{"null byte in repo name", "repo\x00evil", "chart", "1.0.0"},
		{"null byte in version", "repo", "chart", "1.0.0\x00"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := &HelmRepoManager{
				indices: make(map[string]*repo.IndexFile),
			}
			_, err := m.GetValues(tc.repoName, tc.chartName, tc.version)
			if err == nil {
				t.Fatal("expected error for path-traversal input, got nil")
			}
			if !strings.Contains(err.Error(), "invalid") {
				t.Errorf("expected validation error containing 'invalid', got: %v", err)
			}
		})
	}
}

func TestGetVersions_PathTraversalInputs_AreRejected(t *testing.T) {
	cases := []struct {
		name      string
		repoName  string
		chartName string
	}{
		{"dotdot in repo name", "../evil", "chart"},
		{"slash in chart name", "repo", "path/chart"},
		{"null byte in repo name", "repo\x00", "chart"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := &HelmRepoManager{
				indices: make(map[string]*repo.IndexFile),
			}
			_, err := m.GetVersions(tc.repoName, tc.chartName)
			if err == nil {
				t.Fatal("expected error for path-traversal input, got nil")
			}
			if !strings.Contains(err.Error(), "invalid") {
				t.Errorf("expected validation error containing 'invalid', got: %v", err)
			}
		})
	}
}

func TestLatestVersion_EmptyIndex_NotFound(t *testing.T) {
	m := &HelmRepoManager{indices: make(map[string]*repo.IndexFile)}
	_, _, found := m.LatestVersion("nginx")
	if found {
		t.Error("expected found=false for empty index")
	}
}

func TestLatestVersion_SingleRepo_ReturnsLatest(t *testing.T) {
	m := &HelmRepoManager{
		indices: map[string]*repo.IndexFile{
			"bitnami": {
				Entries: map[string]repo.ChartVersions{
					"nginx": {
						{Metadata: &chart.Metadata{Name: "nginx", Version: "15.0.0"}},
						{Metadata: &chart.Metadata{Name: "nginx", Version: "14.1.0"}},
					},
				},
			},
		},
	}
	version, fullName, found := m.LatestVersion("nginx")
	if !found {
		t.Fatal("expected found=true")
	}
	if version != "15.0.0" {
		t.Errorf("expected version=15.0.0, got %s", version)
	}
	if fullName != "bitnami/nginx" {
		t.Errorf("expected fullName=bitnami/nginx, got %s", fullName)
	}
}

func TestLatestVersion_MultipleRepos_ReturnsGlobalMax(t *testing.T) {
	m := &HelmRepoManager{
		indices: map[string]*repo.IndexFile{
			"bitnami": {
				Entries: map[string]repo.ChartVersions{
					"nginx": {
						{Metadata: &chart.Metadata{Name: "nginx", Version: "15.0.0"}},
					},
				},
			},
			"stable": {
				Entries: map[string]repo.ChartVersions{
					"nginx": {
						{Metadata: &chart.Metadata{Name: "nginx", Version: "9.5.0"}},
					},
				},
			},
		},
	}
	version, _, found := m.LatestVersion("nginx")
	if !found {
		t.Fatal("expected found=true")
	}
	// 15.0.0 > 9.5.0 semver-wise
	if version != "15.0.0" {
		t.Errorf("expected global max 15.0.0, got %s", version)
	}
}

func TestLatestVersion_ChartNotInAnyRepo_NotFound(t *testing.T) {
	m := &HelmRepoManager{
		indices: map[string]*repo.IndexFile{
			"bitnami": {
				Entries: map[string]repo.ChartVersions{
					"postgres": {
						{Metadata: &chart.Metadata{Name: "postgres", Version: "1.0.0"}},
					},
				},
			},
		},
	}
	_, _, found := m.LatestVersion("nginx")
	if found {
		t.Error("expected found=false when chart not in any repo")
	}
}

func TestLatestVersion_UnparseableVersions_FallsBackToRaw(t *testing.T) {
	m := &HelmRepoManager{
		indices: map[string]*repo.IndexFile{
			"custom": {
				Entries: map[string]repo.ChartVersions{
					"myapp": {
						{Metadata: &chart.Metadata{Name: "myapp", Version: "not-a-version"}},
					},
				},
			},
		},
	}
	version, fullName, found := m.LatestVersion("myapp")
	if !found {
		t.Fatal("expected found=true (fallback to raw string)")
	}
	if version != "not-a-version" {
		t.Errorf("expected raw fallback version, got %s", version)
	}
	if fullName != "custom/myapp" {
		t.Errorf("expected fullName=custom/myapp, got %s", fullName)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

type stubError struct{ msg string }

func (e *stubError) Error() string { return e.msg }
