package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/podscape/go-core/internal/store"
)

// dynClientFactory is an injectable factory for the dynamic client.
// Tests override this to inject a fake dynamic client without needing a real API server.
var dynClientFactory = func(cfg *rest.Config) (dynamic.Interface, error) {
	return dynamic.NewForConfig(cfg)
}

// HandleCustomResource lists arbitrary CRD resources via the dynamic client.
// Query params:
//   crd       — full CRD plural name, e.g. "virtualservices.networking.istio.io"
//   namespace — optional; omit for cluster-scoped resources or all-namespaces view
//
// Splits the CRD name on the first dot to obtain resource+group, discovers the
// preferred API version, then lists with the dynamic client. Returns JSON []any.
func HandleCustomResource(w http.ResponseWriter, r *http.Request) {
	crdName := strings.TrimSpace(r.URL.Query().Get("crd"))
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))

	if crdName == "" {
		http.Error(w, "crd query parameter is required", http.StatusBadRequest)
		return
	}

	dotIdx := strings.Index(crdName, ".")
	if dotIdx <= 0 {
		http.Error(w, fmt.Sprintf("invalid crd name %q: expected <resource>.<group>", crdName), http.StatusBadRequest)
		return
	}
	resource := crdName[:dotIdx]
	group := crdName[dotIdx+1:]

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil || cfg == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]any{})
		return
	}

	version, err := preferredGroupVersion(cs, group)
	if err != nil {
		log.Printf("[customresource] discovery failed for group %q: %v", group, err)
		http.Error(w, fmt.Sprintf("discovery failed: %v", err), http.StatusInternalServerError)
		return
	}

	dynClient, err := dynClientFactory(cfg)
	if err != nil {
		log.Printf("[customresource] dynamic client error: %v", err)
		http.Error(w, "failed to create dynamic client", http.StatusInternalServerError)
		return
	}

	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}

	var ri dynamic.ResourceInterface
	if namespace != "" && namespace != "_all" {
		ri = dynClient.Resource(gvr).Namespace(namespace)
	} else {
		ri = dynClient.Resource(gvr)
	}

	list, err := ri.List(r.Context(), metav1.ListOptions{})
	if err != nil {
		log.Printf("[customresource] list %s/%s (ns=%q) failed: %v", group, resource, namespace, err)
		http.Error(w, fmt.Sprintf("list failed: %v", err), http.StatusInternalServerError)
		return
	}

	items := make([]any, len(list.Items))
	for i, obj := range list.Items {
		items[i] = obj.Object
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(items); err != nil {
		log.Printf("[customresource] encode error: %v", err)
	}
}

// preferredGroupVersion returns the server's preferred version string for the
// given API group name by querying the discovery API.
func preferredGroupVersion(cs kubernetes.Interface, group string) (string, error) {
	groups, err := cs.Discovery().ServerGroups()
	if err != nil {
		return "", err
	}
	for _, g := range groups.Groups {
		if g.Name == group {
			if g.PreferredVersion.Version != "" {
				return g.PreferredVersion.Version, nil
			}
			if len(g.Versions) > 0 {
				return g.Versions[0].Version, nil
			}
		}
	}
	return "", fmt.Errorf("API group %q not found on server", group)
}
