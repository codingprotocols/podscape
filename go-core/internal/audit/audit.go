// Package audit implements a local, append-only, hash-chained audit log for
// mutating actions taken through the Podscape sidecar. See
// docs/superpowers/specs/2026-09-25-audit-log-design.md for the full design.
package audit

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"sync"
	"time"
)

// DefaultDir returns the standard directory holding the audit log and its
// rotated archives (~/.podscape), the same convention Electron's main
// process uses for settings.json. Falls back to "." if the home directory
// cannot be resolved (should not happen in practice).
func DefaultDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return filepath.Join(home, ".podscape")
}

// DefaultPath returns the standard active audit log path (DefaultDir()/audit.log).
func DefaultPath() string {
	return filepath.Join(DefaultDir(), "audit.log")
}

// Event is one audit log entry. Callers populate the action-specific fields
// (everything except Seq, Timestamp, OSUser, PrevHash, Hash) and pass it to
// Writer.Record, which fills in the rest.
type Event struct {
	Seq              int64  `json:"seq"`
	Timestamp        string `json:"timestamp"`
	Action           string `json:"action"`
	KubeContext      string `json:"kube_context"`
	KubeUser         string `json:"kube_user"`
	KubeClientCertCN string `json:"kube_client_cert_cn"`
	OSUser           string `json:"os_user"`
	Namespace        string `json:"namespace"`
	ResourceKind     string `json:"resource_kind"`
	ResourceName     string `json:"resource_name"`
	// Params holds action-specific details. Verification recomputes each
	// entry's hash by re-marshaling the event parsed back from disk, so every
	// Params value MUST round-trip through map[string]any byte-identically —
	// otherwise a legitimate entry verifies as tampered. Strings and small
	// integers are safe; avoid values that don't survive the JSON ->
	// map[string]any -> JSON cycle, notably int64s above 2^53 (they decode as
	// float64 and lose precision) and arbitrary floats. Stringify such values
	// (e.g. a byte count or numeric resourceVersion as a string) before
	// putting them here.
	Params     map[string]any `json:"params"`
	Outcome    string         `json:"outcome"`
	Error      string         `json:"error"`
	DurationMs int64          `json:"duration_ms"`
	PrevHash   string         `json:"prev_hash"`
	Hash       string         `json:"hash"`
}

// rotateAfter and rotateAtBytes are the two rotation triggers — whichever
// is hit first closes the active file out as a timestamped archive and
// starts a fresh one. 30 days keeps each archive a manageable, roughly
// monthly chunk; 50MB is a backstop for unusually chatty usage.
const (
	rotateAfter   = 30 * 24 * time.Hour
	rotateAtBytes = 50 << 20 // 50 MB
)

// DefaultRetention is how long a rotated (archived) audit log file is kept
// before Prune deletes it. The active file is never pruned regardless of
// age. 90 days is a common baseline for local compliance/audit retention.
const DefaultRetention = 90 * 24 * time.Hour

// Writer appends Events to a hash-chained JSONL file, rotating to a new
// timestamped file when the active one grows too old or too large. All
// exported methods are safe for concurrent use.
type Writer struct {
	mu           sync.Mutex
	f            *os.File
	path         string // fixed "active" path, e.g. ~/.podscape/audit.log
	osUser       string
	lastSeq      int64
	lastHash     string
	openedAt     time.Time // age reference for rotation: the active file's first entry's time, or now() for a fresh file
	bytesWritten int64
}

// Global is the process-wide audit Writer, initialized to a no-op Writer at
// package load time and replaced with a real one at sidecar startup
// (cmd/podscape-core/main.go). Handlers call audit.Global.Record(...)
// directly rather than threading a Writer through every function signature.
// Defaulting to NewNoop() (rather than leaving Global as a nil *Writer)
// means any code path that runs before or without main.go's wiring — tests,
// in particular — never nil-panics; Record simply reports the expected
// "audit log is not available" error instead.
var Global *Writer = NewNoop()

// Open opens (creating if necessary) the audit log at path for appending,
// creating its parent directory if needed, and recovers the last entry's
// seq/hash so new entries chain correctly onto any existing file.
func Open(path string) (*Writer, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, fmt.Errorf("creating audit log directory: %w", err)
	}

	lastSeq, lastHash, firstTimestamp, err := readTail(path)
	if err != nil {
		return nil, fmt.Errorf("reading existing audit log tail: %w", err)
	}

	// O_RDWR (not O_WRONLY) so truncatePartialTail can read the file's tail;
	// O_APPEND still forces every write to the end regardless.
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("opening audit log: %w", err)
	}

	bytesWritten := int64(0)
	if fi, statErr := f.Stat(); statErr == nil {
		bytesWritten = fi.Size()
	}

	// Repair a partial final line left by a crash mid-write. Record always
	// terminates each entry with '\n', so any bytes after the last newline
	// are an incomplete write that never chained onto the log (readTail
	// skipped them above). Discarding them keeps the next append on a clean
	// line boundary — otherwise O_APPEND would weld the new entry onto the
	// partial bytes, producing one corrupt interior line that makes Verify
	// mistake crash damage for tampering. Best-effort: a truncation failure
	// leaves the file as-is rather than blocking audit logging.
	if n, terr := truncatePartialTail(f, bytesWritten); terr == nil {
		bytesWritten = n
	}

	openedAt := time.Now()
	if firstTimestamp != nil {
		openedAt = *firstTimestamp
	}

	osUser := ""
	if u, err := user.Current(); err == nil {
		osUser = u.Username
	}

	return &Writer{
		f: f, path: path, osUser: osUser,
		lastSeq: lastSeq, lastHash: lastHash,
		openedAt: openedAt, bytesWritten: bytesWritten,
	}, nil
}

// NewNoop returns a Writer whose Record always returns an error without
// touching disk. Used when the real audit log could not be opened, so
// callers never need a nil check and mutating actions still proceed
// (fail-open) with the failure surfaced via the returned error.
func NewNoop() *Writer {
	return &Writer{}
}

// Record appends ev to the log, filling in Seq, Timestamp, OSUser, PrevHash,
// and Hash. Safe for concurrent use — writes are serialized under w.mu and
// fsync'd before returning. Returns an error rather than panicking on any
// failure so callers can log-and-continue per the fail-open policy.
func (w *Writer) Record(ev Event) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.f == nil {
		return fmt.Errorf("audit log is not available (writer not opened)")
	}

	ev.Seq = w.lastSeq + 1
	ev.Timestamp = time.Now().UTC().Format(time.RFC3339)
	ev.OSUser = w.osUser
	ev.PrevHash = w.lastHash
	if ev.Params == nil {
		ev.Params = map[string]any{}
	}
	ev.Hash = ""

	hashInput, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("marshaling audit event for hashing: %w", err)
	}
	sum := sha256.Sum256(append([]byte(ev.PrevHash), hashInput...))
	ev.Hash = hex.EncodeToString(sum[:])

	line, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("marshaling final audit event: %w", err)
	}
	line = append(line, '\n')

	if _, err := w.f.Write(line); err != nil {
		return fmt.Errorf("writing audit event: %w", err)
	}
	if err := w.f.Sync(); err != nil {
		return fmt.Errorf("syncing audit log: %w", err)
	}

	w.lastSeq = ev.Seq
	w.lastHash = ev.Hash
	w.bytesWritten += int64(len(line))

	// Rotation is best-effort and never fails this already-successful
	// Record call — if it errors, the active file simply keeps growing and
	// rotation is retried on the next Record.
	if w.path != "" && (time.Since(w.openedAt) > rotateAfter || w.bytesWritten > rotateAtBytes) {
		_ = w.rotate()
	}
	return nil
}

// rotate closes the current file, renames it to a timestamped archive
// (audit-<UTC timestamp>.log, sorting chronologically alongside other
// archives and always before the active audit.log), and opens a fresh file
// at w.path. Must be called while holding w.mu. w.lastHash is deliberately
// NOT reset — the new file's first entry chains its prev_hash from the
// archived file's last hash, so the hash chain stays continuous across the
// rotation boundary (see VerifyDir). w.lastSeq resets to 0: seq is a
// per-file counter, not a global one.
func (w *Writer) rotate() error {
	if err := w.f.Close(); err != nil {
		return fmt.Errorf("closing current audit log before rotation: %w", err)
	}
	archivePath := filepath.Join(filepath.Dir(w.path), fmt.Sprintf("audit-%s.log", time.Now().UTC().Format("20060102T150405Z")))
	if err := os.Rename(w.path, archivePath); err != nil {
		f, reopenErr := os.OpenFile(w.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
		if reopenErr != nil {
			return fmt.Errorf("rename failed (%v) and reopen failed: %w", err, reopenErr)
		}
		w.f = f
		return fmt.Errorf("renaming audit log for rotation: %w", err)
	}
	f, err := os.OpenFile(w.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("opening new audit log after rotation: %w", err)
	}
	w.f = f
	w.openedAt = time.Now()
	w.bytesWritten = 0
	w.lastSeq = 0
	return nil
}

// readTail scans path line by line and returns the seq/hash of the last
// line that unmarshals into a valid Event with a non-empty Hash, so a fresh
// Writer resumes the chain correctly, plus the first valid entry's parsed
// timestamp (nil if the file is missing, empty, or has no valid entries) —
// used as the file's age reference for rotation. Any malformed or partial
// trailing line (e.g. left by a crash mid-write) is skipped rather than
// treated as fatal — it remains in the file (append-only; never rewritten)
// but does not participate in the chain. Returns (0, "genesis", nil, nil)
// for a missing or empty file, or when no line parses successfully.
func readTail(path string) (lastSeq int64, lastHash string, firstTimestamp *time.Time, err error) {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return 0, "genesis", nil, nil
	}
	if err != nil {
		return 0, "", nil, err
	}
	defer f.Close()

	lastSeq = 0
	lastHash = "genesis"
	dec := json.NewDecoder(f)
	for {
		var ev Event
		if decErr := dec.Decode(&ev); decErr != nil {
			break // EOF, or a malformed trailing line — either way, stop here
		}
		if ev.Hash == "" {
			continue
		}
		if firstTimestamp == nil {
			if t, parseErr := time.Parse(time.RFC3339, ev.Timestamp); parseErr == nil {
				firstTimestamp = &t
			}
		}
		lastSeq = ev.Seq
		lastHash = ev.Hash
	}
	return lastSeq, lastHash, firstTimestamp, nil
}

// truncatePartialTail discards any bytes following the last newline in f,
// which (because Record always newline-terminates each entry) can only be a
// partial line from a crash mid-write. Returns the file size afterwards. The
// file is scanned backward in bounded chunks so a large log is never pulled
// fully into memory. A file that already ends on a line boundary, or is
// empty, is left untouched.
func truncatePartialTail(f *os.File, size int64) (int64, error) {
	if size == 0 {
		return 0, nil
	}
	const chunk = 64 * 1024
	buf := make([]byte, chunk)
	for off := size; off > 0; {
		readSize := int64(chunk)
		if off < readSize {
			readSize = off
		}
		start := off - readSize
		n, err := f.ReadAt(buf[:readSize], start)
		if err != nil && err != io.EOF {
			return size, err
		}
		for i := n - 1; i >= 0; i-- {
			if buf[i] == '\n' {
				newSize := start + int64(i) + 1
				if newSize == size {
					return size, nil // already ends on a line boundary
				}
				if terr := f.Truncate(newSize); terr != nil {
					return size, terr
				}
				return newSize, nil
			}
		}
		off = start
	}
	// No newline anywhere: the whole file is a single unterminated line.
	if err := f.Truncate(0); err != nil {
		return size, err
	}
	return 0, nil
}
