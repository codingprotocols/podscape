package audit

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Verify walks the single audit log file at path and recomputes each
// entry's hash from its stored prev_hash plus its own content, comparing
// against the entry's stored hash, treating the very first entry as
// chaining from "genesis". Returns ok=false and the seq of the first entry
// where the chain breaks (a modified, deleted, reordered, or malformed
// entry) — 0 if the break is detected before any valid seq is known (e.g.
// the very first line is malformed). A missing file verifies as ok=true
// (nothing to verify), matching Writer's treatment of a fresh log.
//
// Verify only checks path in isolation. For a rotated file (whose first
// entry legitimately chains from a previous, archived file's last hash
// rather than "genesis"), use VerifyDir instead, which checks the full
// multi-file chain across an entire audit directory.
func Verify(path string) (ok bool, brokenAtSeq int64, err error) {
	ok, brokenAtSeq, _, err = verifyFile(path, "genesis")
	return ok, brokenAtSeq, err
}

// VerifyDir verifies the full multi-file audit log chain in dir: every
// archived file (audit-<timestamp>.log, oldest first — filenames sort
// chronologically) followed by the active audit.log, checking that each
// file is internally consistent AND that each file's first entry correctly
// chains from the previous file's last hash (or "genesis" for the very
// first file that ever existed). Returns the archive/active filename and
// seq where the chain first breaks, if any. A directory with no audit
// files at all verifies as ok=true.
func VerifyDir(dir string) (ok bool, brokenAtFile string, brokenAtSeq int64, err error) {
	files, err := listChainFiles(dir)
	if err != nil {
		return false, "", 0, err
	}

	prevHash := "genesis"
	for _, path := range files {
		fileOK, fileBrokenSeq, endHash, ferr := verifyFile(path, prevHash)
		if ferr != nil {
			return false, filepath.Base(path), 0, ferr
		}
		if !fileOK {
			return false, filepath.Base(path), fileBrokenSeq, nil
		}
		prevHash = endHash
	}
	return true, "", 0, nil
}

// ReadEntries returns every Event across the full audit log chain in dir
// (archived files oldest-first, then the active audit.log), in
// chronological order. Malformed lines are skipped rather than failing the
// whole read, consistent with how Writer/Verify treat a corrupted trailing
// line. A missing directory returns an empty slice, not an error.
func ReadEntries(dir string) ([]Event, error) {
	files, err := listChainFiles(dir)
	if err != nil {
		return nil, err
	}

	var entries []Event
	for _, path := range files {
		f, err := os.Open(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("opening %s: %w", path, err)
		}
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 0, 64*1024), 10<<20)
		for scanner.Scan() {
			line := scanner.Bytes()
			if len(bytesTrimSpace(line)) == 0 {
				continue
			}
			var ev Event
			if json.Unmarshal(line, &ev) != nil {
				continue
			}
			entries = append(entries, ev)
		}
		scanErr := scanner.Err()
		f.Close()
		if scanErr != nil {
			return nil, fmt.Errorf("scanning %s: %w", path, scanErr)
		}
	}
	return entries, nil
}

// listChainFiles returns the full chronological chain of audit log files in
// dir: archived files (audit-<timestamp>.log) sorted oldest-first, followed
// by the active audit.log if present. Missing files/dir yield an empty
// slice, not an error.
func listChainFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var archives []string
	activePath := ""
	for _, e := range entries {
		name := e.Name()
		if name == "audit.log" {
			activePath = filepath.Join(dir, name)
			continue
		}
		if strings.HasPrefix(name, "audit-") && strings.HasSuffix(name, ".log") {
			archives = append(archives, filepath.Join(dir, name))
		}
	}
	// "audit-<timestamp>.log" filenames sort lexically in chronological
	// order (fixed-width zero-padded timestamp format), so a plain string
	// sort is sufficient.
	sort.Strings(archives)

	if activePath != "" {
		archives = append(archives, activePath)
	}
	return archives, nil
}

// verifyFile is the shared core of Verify and VerifyDir: it walks path,
// recomputing each entry's hash starting from startPrevHash, and returns
// whether the file's internal chain is valid, where it broke if not, and
// the last entry's hash (the expected startPrevHash for whatever file
// chains after this one).
func verifyFile(path string, startPrevHash string) (ok bool, brokenAtSeq int64, endHash string, err error) {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return true, 0, startPrevHash, nil
	}
	if err != nil {
		return false, 0, "", err
	}
	defer f.Close()

	prevHash := startPrevHash
	sawUnparsable := false
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 10<<20) // allow lines up to 10MB
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(bytesTrimSpace(line)) == 0 {
			continue
		}
		if sawUnparsable {
			// A non-empty line followed one we couldn't parse, so the bad
			// line is interior — genuine corruption or tampering, not the
			// benign unterminated final line a crash mid-write can leave
			// (which readTail/Open tolerate and repair). Fail the chain.
			return false, 0, "", nil
		}

		var ev Event
		if unmarshalErr := json.Unmarshal(line, &ev); unmarshalErr != nil {
			// Defer judgment: an unparsable line is tolerated only if it
			// turns out to be the very last non-empty line (checked at the
			// top of the loop on the next iteration). endHash deliberately
			// stays at the last valid entry's hash so a following file still
			// chains correctly.
			sawUnparsable = true
			continue
		}
		if ev.PrevHash != prevHash {
			return false, ev.Seq, "", nil
		}

		storedHash := ev.Hash
		ev.Hash = ""
		hashInput, marshalErr := json.Marshal(ev)
		if marshalErr != nil {
			return false, ev.Seq, "", nil
		}
		sum := sha256.Sum256(append([]byte(ev.PrevHash), hashInput...))
		computedHash := hex.EncodeToString(sum[:])
		if computedHash != storedHash {
			return false, ev.Seq, "", nil
		}

		prevHash = storedHash
	}
	if scanErr := scanner.Err(); scanErr != nil {
		return false, 0, "", fmt.Errorf("scanning audit log %s: %w", path, scanErr)
	}
	return true, 0, prevHash, nil
}

// bytesTrimSpace avoids importing "bytes" solely for TrimSpace in this file.
func bytesTrimSpace(b []byte) []byte {
	start, end := 0, len(b)
	for start < end && isSpace(b[start]) {
		start++
	}
	for end > start && isSpace(b[end-1]) {
		end--
	}
	return b[start:end]
}

func isSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}
