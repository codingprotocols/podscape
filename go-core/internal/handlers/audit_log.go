package handlers

import (
	"net/http"
	"strconv"

	"github.com/podscape/go-core/internal/audit"
)

// auditDirFunc resolves the directory HandleAuditLog reads from. A package
// variable (rather than calling audit.DefaultDir() directly) so tests can
// point it at a temp directory instead of the real ~/.podscape — same
// injectable-function pattern as syncInformersFunc/rbacVerbCheckFunc
// elsewhere in this package.
var auditDirFunc = audit.DefaultDir

const (
	defaultAuditLogLimit = 200
	maxAuditLogLimit     = 2000
)

// HandleAuditLog returns audit log entries (see internal/audit), newest
// first, optionally filtered by the "action" and/or "outcome" query
// parameters and capped at "limit" (default 200, max 2000). This is local
// machine data, not a per-cluster Kubernetes resource — it bypasses
// AllResourceDefs/MakeHandler and RBAC entirely, unlike every other
// handler in this package.
func HandleAuditLog(w http.ResponseWriter, r *http.Request) {
	entries, err := audit.ReadEntries(auditDirFunc())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	actionFilter := r.URL.Query().Get("action")
	outcomeFilter := r.URL.Query().Get("outcome")

	limit := defaultAuditLogLimit
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= maxAuditLogLimit {
			limit = n
		}
	}

	// entries is chronological (oldest first) — walk backward for
	// newest-first, applying filters, until limit is reached.
	filtered := make([]audit.Event, 0, limit)
	for i := len(entries) - 1; i >= 0 && len(filtered) < limit; i-- {
		ev := entries[i]
		if actionFilter != "" && ev.Action != actionFilter {
			continue
		}
		if outcomeFilter != "" && ev.Outcome != outcomeFilter {
			continue
		}
		filtered = append(filtered, ev)
	}

	writeJSON(w, filtered)
}
