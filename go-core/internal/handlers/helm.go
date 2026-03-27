package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/podscape/go-core/internal/helm"
	"github.com/podscape/go-core/internal/store"
)

func HandleHelmList(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	releases, err := helm.ListReleases(kubeconfig, context, namespace)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(releases)
}

func HandleHelmStatus(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	status, err := helm.GetReleaseStatus(kubeconfig, context, namespace, release)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(status))
}

func HandleHelmValues(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")
	all := r.URL.Query().Get("all") == "true"

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	values, err := helm.GetReleaseValues(kubeconfig, context, namespace, release, all)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/yaml")
	w.Write([]byte(values))
}

func HandleHelmHistory(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	history, err := helm.GetReleaseHistory(kubeconfig, context, namespace, release)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

func HandleHelmRollback(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	releaseName := r.URL.Query().Get("release")
	revisionStr := r.URL.Query().Get("revision")
	revision, err := strconv.Atoi(revisionStr)
	if err != nil || revisionStr == "" || revision <= 0 {
		http.Error(w, "invalid revision: must be a positive integer", http.StatusBadRequest)
		return
	}

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	if err = helm.RollbackRelease(kubeconfig, context, namespace, releaseName, revision); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleHelmUpgrade(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	namespace := r.URL.Query().Get("namespace")
	releaseName := r.URL.Query().Get("release")
	if namespace == "" || releaseName == "" {
		http.Error(w, "namespace and release are required", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	if err := helm.UpgradeRelease(kubeconfig, context, namespace, releaseName, string(body)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleHelmUninstall(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	releaseName := r.URL.Query().Get("release")

	if namespace == "" || releaseName == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	store.Store.RLock()
	kubeconfig := store.Store.Kubeconfig
	context := store.Store.ActiveContextName
	store.Store.RUnlock()

	_, err := helm.UninstallRelease(kubeconfig, context, namespace, releaseName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleHelmRepoList(w http.ResponseWriter, r *http.Request) {
	mgr := helm.GetRepoManager()
	repos, err := mgr.ListRepos()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(repos)
}

func HandleHelmRepoSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 30
	offset := 0
	if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
		limit = v
	}
	if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
		offset = v
	}

	mgr := helm.GetRepoManager()
	result := mgr.Search(query, limit, offset)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func HandleHelmRepoVersions(w http.ResponseWriter, r *http.Request) {
	repoName := r.URL.Query().Get("repo")
	chartName := r.URL.Query().Get("chart")
	if repoName == "" || chartName == "" {
		http.Error(w, "repo and chart are required", http.StatusBadRequest)
		return
	}

	mgr := helm.GetRepoManager()
	versions, err := mgr.GetVersions(repoName, chartName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(versions)
}

func HandleHelmRepoValues(w http.ResponseWriter, r *http.Request) {
	repoName := r.URL.Query().Get("repo")
	chartName := r.URL.Query().Get("chart")
	version := r.URL.Query().Get("version")
	if repoName == "" || chartName == "" || version == "" {
		http.Error(w, "repo, chart, and version are required", http.StatusBadRequest)
		return
	}

	mgr := helm.GetRepoManager()
	values, err := mgr.GetValues(repoName, chartName, version)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(values))
}

func HandleHelmRepoRefresh(w http.ResponseWriter, r *http.Request) {
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

	mgr := helm.GetRepoManager()
	err := mgr.Refresh(func(msg string) {
		sseEvent(w, flusher, "progress", msg)
	})
	if err != nil {
		sseEvent(w, flusher, "error", err.Error())
		return
	}
	sseEvent(w, flusher, "result", "ok")
}

func HandleHelmInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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

	body, err := io.ReadAll(r.Body)
	if err != nil {
		sseEvent(w, flusher, "error", "failed to read request body")
		return
	}

	err = helm.InstallFromJSON(body, func(msg string) {
		sseEvent(w, flusher, "progress", msg)
	})
	if err != nil {
		sseEvent(w, flusher, "error", err.Error())
		return
	}
	sseEvent(w, flusher, "result", "ok")
}
