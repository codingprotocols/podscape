package audit

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

// archiveTimestampLayout matches the format rotate() uses to name archived
// files: audit-<UTC timestamp>.log.
const archiveTimestampLayout = "20060102T150405Z"

// Prune deletes archived (rotated) audit log files in dir whose embedded
// rotation timestamp is older than maxAge. The active audit.log is never
// touched, and files that don't match the audit-<timestamp>.log naming
// convention are left alone. A missing directory is not an error — there
// is simply nothing to prune. Returns the full paths of deleted files;
// a single file that fails to delete is skipped (best-effort) rather than
// aborting the rest of the pass.
func Prune(dir string, maxAge time.Duration) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	cutoff := time.Now().Add(-maxAge)
	var deleted []string
	for _, e := range entries {
		name := e.Name()
		if name == "audit.log" || !strings.HasPrefix(name, "audit-") || !strings.HasSuffix(name, ".log") {
			continue
		}
		ts, ok := parseArchiveTimestamp(name)
		if !ok || ts.After(cutoff) {
			continue
		}
		path := filepath.Join(dir, name)
		if err := os.Remove(path); err != nil {
			continue
		}
		deleted = append(deleted, path)
	}
	return deleted, nil
}

// parseArchiveTimestamp extracts the rotation timestamp embedded in an
// archive filename ("audit-20260925T120000Z.log" -> that time, ok=true).
func parseArchiveTimestamp(name string) (time.Time, bool) {
	inner := strings.TrimSuffix(strings.TrimPrefix(name, "audit-"), ".log")
	t, err := time.Parse(archiveTimestampLayout, inner)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}
