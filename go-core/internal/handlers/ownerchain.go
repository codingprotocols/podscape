package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/podscape/go-core/internal/ownerchain"
	"github.com/podscape/go-core/internal/store"
)

// ── Owner Chain ─────────────────────────────────────────────────────────────

func HandleOwnerChain(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	namespace := r.URL.Query().Get("namespace")

	if kind == "" || name == "" {
		http.Error(w, "kind and name are required", http.StatusBadRequest)
		return
	}

	store.Store.RLock()
	c := store.Store.ActiveCache
	store.Store.RUnlock()
	if c == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	chain := ownerchain.BuildOwnerChain(c, kind, namespace, name)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chain)
}
