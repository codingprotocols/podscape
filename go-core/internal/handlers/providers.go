package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/podscape/go-core/internal/providers"
	"github.com/podscape/go-core/internal/store"
	networkingv1 "k8s.io/api/networking/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// HandleProviders detects which ingress controllers and service mesh providers
// are present in the active cluster and returns a ProviderSet JSON object.
// Always returns 200 — an empty ProviderSet is returned if detection fails so
// the renderer degrades gracefully rather than showing an error.
func HandleProviders(w http.ResponseWriter, r *http.Request) {
	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(providers.ProviderSet{})
		return
	}

	var icList []networkingv1.IngressClass
	icl, err := cs.NetworkingV1().IngressClasses().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		log.Printf("[providers] failed to list IngressClasses: %v", err)
	} else {
		icList = icl.Items
	}

	hubbleRelayPresent := false
	_, hubbleErr := cs.CoreV1().Services(providers.HubbleRelayNamespace).Get(r.Context(), providers.HubbleRelayService, metav1.GetOptions{})
	if hubbleErr == nil {
		hubbleRelayPresent = true
	} else if !k8serrors.IsNotFound(hubbleErr) {
		log.Printf("[providers] failed to check hubble-relay service: %v", hubbleErr)
	}

	ps := providers.Detect(cs.Discovery(), icList, hubbleRelayPresent)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(ps); err != nil {
		log.Printf("[providers] failed to encode response: %v", err)
	}
}
