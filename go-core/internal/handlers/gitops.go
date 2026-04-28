package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"

	"github.com/podscape/go-core/internal/store"
)

// GitOpsResource represents a single Flux or Argo CD resource.
type GitOpsResource struct {
	Kind       string            `json:"kind"`
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Status     string            `json:"status"`
	Ready      bool              `json:"ready"`
	Suspended  bool              `json:"suspended"`
	SyncStatus string            `json:"syncStatus,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
	Source     string            `json:"source,omitempty"`
	Revision   string            `json:"revision,omitempty"`
	Message    string            `json:"message,omitempty"`
}

// GitOpsResponse is the top-level response for the /gitops endpoint.
type GitOpsResponse struct {
	FluxDetected bool             `json:"fluxDetected"`
	ArgoDetected bool             `json:"argoDetected"`
	Resources    []GitOpsResource `json:"resources"`
}

var gitopsGVRs = []schema.GroupVersionResource{
	// Flux v2
	{Group: "kustomize.toolkit.fluxcd.io", Version: "v1", Resource: "kustomizations"},
	{Group: "kustomize.toolkit.fluxcd.io", Version: "v1beta2", Resource: "kustomizations"},
	{Group: "helm.toolkit.fluxcd.io", Version: "v2", Resource: "helmreleases"},
	{Group: "helm.toolkit.fluxcd.io", Version: "v2beta1", Resource: "helmreleases"},
	{Group: "source.toolkit.fluxcd.io", Version: "v1", Resource: "gitrepositories"},
	{Group: "source.toolkit.fluxcd.io", Version: "v1beta2", Resource: "helmrepositories"},
	// Argo CD
	{Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"},
	{Group: "argoproj.io", Version: "v1alpha1", Resource: "appprojects"},
}

// clusterScopedGitOpsResources is the set of GitOps resource plural names that are
// cluster-scoped. These must never be listed with a namespace filter — passing a
// namespace to a cluster-scoped resource causes the API server to return an error
// (silently swallowed here) and the resource is never shown.
//
// Currently: Argo CD AppProject — it spans all namespaces in the cluster.
var clusterScopedGitOpsResources = map[string]bool{
	"appprojects": true,
}

// gitopsKindGVR maps the Kind name to its canonical GVR for reconcile/suspend operations.
// Flux v1beta2 variants fall back to v1 if not found — that's acceptable for patching.
var gitopsKindGVR = map[string]schema.GroupVersionResource{
	"Kustomization":  {Group: "kustomize.toolkit.fluxcd.io", Version: "v1", Resource: "kustomizations"},
	"HelmRelease":    {Group: "helm.toolkit.fluxcd.io", Version: "v2", Resource: "helmreleases"},
	"GitRepository":  {Group: "source.toolkit.fluxcd.io", Version: "v1", Resource: "gitrepositories"},
	"HelmRepository": {Group: "source.toolkit.fluxcd.io", Version: "v1beta2", Resource: "helmrepositories"},
	"Application":    {Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"},
	"AppProject":     {Group: "argoproj.io", Version: "v1alpha1", Resource: "appprojects"},
}

func HandleGitOps(w http.ResponseWriter, r *http.Request) {
	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "cluster not connected", http.StatusServiceUnavailable)
		return
	}

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, "failed to create dynamic client: "+err.Error(), http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	ns := r.URL.Query().Get("namespace")

	resp := GitOpsResponse{Resources: []GitOpsResource{}}

	// Track which (group, resource) pairs we have already listed successfully so
	// that preferred versions (v1, v2) suppress their deprecated fallbacks
	// (v1beta2, v2beta1) and avoid triggering client-go deprecation warnings.
	// The key is marked seen only AFTER a successful list so that if a preferred
	// version fails (CRD not installed), its deprecated fallback can still attempt
	// to list. gitopsGVRs is ordered preferred-first for this to work correctly.
	seenGroupResource := map[string]bool{}

	for _, gvr := range gitopsGVRs {
		key := gvr.Group + "/" + gvr.Resource
		if seenGroupResource[key] {
			continue
		}

		var list *unstructured.UnstructuredList
		var listErr error

		// Cluster-scoped resources (e.g. AppProject) must be listed without a
		// namespace filter — the API server rejects namespace-scoped list requests
		// for cluster-scoped resources and the error would be silently swallowed,
		// making the resource invisible when any namespace is selected.
		if ns != "" && !clusterScopedGitOpsResources[gvr.Resource] {
			list, listErr = dynClient.Resource(gvr).Namespace(ns).List(ctx, metav1.ListOptions{})
		} else {
			list, listErr = dynClient.Resource(gvr).List(ctx, metav1.ListOptions{})
		}
		if listErr != nil {
			// Resource type doesn't exist in this cluster — skip silently
			continue
		}
		seenGroupResource[key] = true

		group := gvr.Group
		if strings.Contains(group, "fluxcd.io") {
			resp.FluxDetected = true
		} else if strings.Contains(group, "argoproj.io") {
			resp.ArgoDetected = true
		}

		for _, item := range list.Items {
			gr := GitOpsResource{
				Kind:      item.GetKind(),
				Name:      item.GetName(),
				Namespace: item.GetNamespace(),
				Labels:    item.GetLabels(),
			}

			// Extract status conditions
			conditions, _, _ := unstructured.NestedSlice(item.Object, "status", "conditions")
			for _, cond := range conditions {
				c, ok := cond.(map[string]interface{})
				if !ok {
					continue
				}
				condType, _ := c["type"].(string)
				condStatus, _ := c["status"].(string)
				msg, _ := c["message"].(string)
				if condType == "Ready" || condType == "ReconcileSucceeded" || condType == "Healthy" {
					gr.Ready = condStatus == "True"
					gr.Message = msg
					if gr.Ready {
						gr.Status = "Ready"
					} else {
						gr.Status = "NotReady"
					}
				}
			}

			// Argo CD health
			healthStatus, _, _ := unstructured.NestedString(item.Object, "status", "health", "status")
			if healthStatus != "" {
				gr.Status = healthStatus
				gr.Ready = healthStatus == "Healthy"
			}
			syncStatus, _, _ := unstructured.NestedString(item.Object, "status", "sync", "status")
			if syncStatus != "" && gr.Status == "" {
				gr.Status = syncStatus
			}
			gr.SyncStatus = syncStatus

			// Source ref
			sourceRef, _, _ := unstructured.NestedMap(item.Object, "spec", "sourceRef")
			if name, ok := sourceRef["name"].(string); ok {
				gr.Source = name
			}
			repoURL, _, _ := unstructured.NestedString(item.Object, "spec", "url")
			if repoURL != "" && gr.Source == "" {
				gr.Source = repoURL
			}

			// Revision
			revision, _, _ := unstructured.NestedString(item.Object, "status", "lastAppliedRevision")
			if revision == "" {
				revision, _, _ = unstructured.NestedString(item.Object, "status", "observedRevision")
			}
			gr.Revision = revision

			// Suspended — Flux resources carry spec.suspend; Argo CD uses an annotation.
			suspended, _, _ := unstructured.NestedBool(item.Object, "spec", "suspend")
			gr.Suspended = suspended
			if item.GetAnnotations()["argocd.argoproj.io/skip-reconcile"] == "true" {
				gr.Suspended = true
			}

			if gr.Status == "" {
				gr.Status = "Unknown"
			}
			resp.Resources = append(resp.Resources, gr)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleGitOpsReconcile triggers an immediate reconcile for a Flux or Argo CD resource.
//
// Flux: patches the reconcile.fluxcd.io/requestedAt annotation with the current timestamp.
// Argo CD Application: patches the operation field to initiate a sync.
//
// Query params: kind, name, namespace (all required for namespaced resources).
func HandleGitOpsReconcile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	ns := r.URL.Query().Get("namespace")
	if kind == "" || name == "" {
		http.Error(w, "kind and name are required", http.StatusBadRequest)
		return
	}
	gvr, ok := gitopsKindGVR[kind]
	if !ok {
		http.Error(w, "unsupported kind: "+kind, http.StatusBadRequest)
		return
	}
	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "cluster not connected", http.StatusServiceUnavailable)
		return
	}
	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	ctx := r.Context()
	var ri dynamic.ResourceInterface
	if clusterScopedGitOpsResources[gvr.Resource] {
		ri = dynClient.Resource(gvr)
	} else {
		ri = dynClient.Resource(gvr).Namespace(ns)
	}

	var patchObj interface{}
	if gvr.Group == "argoproj.io" && kind == "Application" {
		// Argo CD: trigger sync via operation field.
		patchObj = map[string]interface{}{
			"operation": map[string]interface{}{
				"sync": map[string]interface{}{"prune": false, "dryRun": false},
			},
		}
	} else {
		// Flux: request reconcile via annotation timestamp.
		patchObj = map[string]interface{}{
			"metadata": map[string]interface{}{
				"annotations": map[string]string{
					"reconcile.fluxcd.io/requestedAt": time.Now().UTC().Format(time.RFC3339Nano),
				},
			},
		}
	}
	patch, err := json.Marshal(patchObj)
	if err != nil {
		http.Error(w, "failed to build patch: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err = ri.Patch(ctx, name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleGitOpsSuspend suspends or resumes a Flux or Argo CD resource.
//
// Flux: patches spec.suspend to true/false.
// Argo CD: sets/clears the argocd.argoproj.io/skip-reconcile annotation.
//
// Query params: kind, name, namespace (required); suspend=true|false (default true).
func HandleGitOpsSuspend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	ns := r.URL.Query().Get("namespace")
	suspend := r.URL.Query().Get("suspend") != "false"
	if kind == "" || name == "" {
		http.Error(w, "kind and name are required", http.StatusBadRequest)
		return
	}
	gvr, ok := gitopsKindGVR[kind]
	if !ok {
		http.Error(w, "unsupported kind: "+kind, http.StatusBadRequest)
		return
	}
	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "cluster not connected", http.StatusServiceUnavailable)
		return
	}
	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	ctx := r.Context()
	var ri dynamic.ResourceInterface
	if clusterScopedGitOpsResources[gvr.Resource] {
		ri = dynClient.Resource(gvr)
	} else {
		ri = dynClient.Resource(gvr).Namespace(ns)
	}

	var patchObj interface{}
	if gvr.Group == "argoproj.io" {
		val := "false"
		if suspend {
			val = "true"
		}
		patchObj = map[string]interface{}{
			"metadata": map[string]interface{}{
				"annotations": map[string]string{
					"argocd.argoproj.io/skip-reconcile": val,
				},
			},
		}
	} else {
		patchObj = map[string]interface{}{
			"spec": map[string]interface{}{"suspend": suspend},
		}
	}
	patch, err := json.Marshal(patchObj)
	if err != nil {
		http.Error(w, "failed to build patch: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err = ri.Patch(ctx, name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
