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
	actionFilter := r.URL.Query().Get("action")
	outcomeFilter := r.URL.Query().Get("outcome")

	// Default to a bounded page. limit=0 explicitly means "no cap" (the full
	// export path); any other out-of-range value falls back to the default.
	limit := defaultAuditLogLimit
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			if n == 0 {
				limit = 0 // unbounded
			} else if n > 0 && n <= maxAuditLogLimit {
				limit = n
			}
		}
	}

	// ReadRecent reads newest-first and stops once the limit is met, so the
	// cost scales with the page size, not the whole retained history.
	entries, err := audit.ReadRecent(auditDirFunc(), limit, actionFilter, outcomeFilter)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, entries)
}
