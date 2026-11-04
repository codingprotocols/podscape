package audit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
)

func TestRecord_SequentialEventsChainCorrectly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	if err := w.Record(Event{Action: "scale", ResourceKind: "Deployment", ResourceName: "api", Outcome: "success"}); err != nil {
		t.Fatalf("Record 1: %v", err)
	}
	if err := w.Record(Event{Action: "delete", ResourceKind: "Pod", ResourceName: "web-1", Outcome: "success"}); err != nil {
		t.Fatalf("Record 2: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	lines := splitNonEmptyLines(data)
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %d", len(lines))
	}

	var ev1, ev2 Event
	if err := json.Unmarshal(lines[0], &ev1); err != nil {
		t.Fatalf("unmarshal line 1: %v", err)
	}
	if err := json.Unmarshal(lines[1], &ev2); err != nil {
		t.Fatalf("unmarshal line 2: %v", err)
	}

	if ev1.Seq != 1 || ev2.Seq != 2 {
		t.Errorf("expected seq 1, 2 — got %d, %d", ev1.Seq, ev2.Seq)
	}
	if ev1.PrevHash != "genesis" {
		t.Errorf("expected first entry's prev_hash to be \"genesis\", got %q", ev1.PrevHash)
	}
	if ev2.PrevHash != ev1.Hash {
		t.Errorf("expected second entry's prev_hash %q to equal first entry's hash %q", ev2.PrevHash, ev1.Hash)
	}
	if ev1.Hash == "" || ev2.Hash == "" {
		t.Error("expected non-empty hash on both entries")
	}
	if ev1.Timestamp == "" || ev2.Timestamp == "" {
		t.Error("expected Record to fill in Timestamp")
	}
}

func TestOpen_RepairsPartialTailFromCrash(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")

	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	for i := 0; i < 2; i++ {
		if err := w.Record(Event{Action: "delete", ResourceName: fmt.Sprintf("pod-%d", i), Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}
	w.f.Close() // simulate process going away

	// Append a partial, unterminated line as a crash mid-write would leave.
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if _, err := f.WriteString(`{"seq":3,"prev_hash":"abc`); err != nil {
		t.Fatalf("write partial: %v", err)
	}
	f.Close()

	// Reopening must discard the partial tail so the next write lands on a
	// clean line boundary instead of welding onto the garbage.
	w2, err := Open(path)
	if err != nil {
		t.Fatalf("reopen Open: %v", err)
	}
	if err := w2.Record(Event{Action: "scale", ResourceName: "api", Outcome: "success"}); err != nil {
		t.Fatalf("Record after recovery: %v", err)
	}

	lines := splitNonEmptyLines(mustReadFile(t, path))
	if len(lines) != 3 {
		t.Fatalf("expected 3 clean lines after recovery, got %d", len(lines))
	}
	for i, line := range lines {
		var ev Event
		if err := json.Unmarshal(line, &ev); err != nil {
			t.Fatalf("line %d is not valid JSON after recovery: %v", i, err)
		}
	}

	ok, brokenAtFile, brokenAtSeq, err := VerifyDir(dir)
	if err != nil {
		t.Fatalf("VerifyDir: %v", err)
	}
	if !ok {
		t.Errorf("expected recovered chain to verify OK, broke at %s seq %d", brokenAtFile, brokenAtSeq)
	}
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	return data
}

// splitNonEmptyLines is a small test helper — not part of the package API.
func splitNonEmptyLines(data []byte) [][]byte {
	var out [][]byte
	start := 0
	for i, b := range data {
		if b == '\n' {
			if i > start {
				out = append(out, data[start:i])
			}
			start = i + 1
		}
	}
	if start < len(data) {
		out = append(out, data[start:])
	}
	return out
}

func TestRecord_ConcurrentWritesProduceUnbrokenChain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	const n = 50
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := w.Record(Event{Action: "delete", ResourceName: fmt.Sprintf("pod-%d", i), Outcome: "success"}); err != nil {
				t.Errorf("Record: %v", err)
			}
		}(i)
	}
	wg.Wait()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	lines := splitNonEmptyLines(data)
	if len(lines) != n {
		t.Fatalf("expected %d lines, got %d", n, len(lines))
	}

	seen := make(map[int64]bool, n)
	prevHash := "genesis"
	// Events are appended in whatever order goroutines won the mutex, not
	// necessarily i=0..n-1, so re-derive the expected order from seq.
	events := make([]Event, n)
	for i, line := range lines {
		if err := json.Unmarshal(line, &events[i]); err != nil {
			t.Fatalf("unmarshal line %d: %v", i, err)
		}
	}
	sort.Slice(events, func(a, b int) bool { return events[a].Seq < events[b].Seq })
	for i, ev := range events {
		if seen[ev.Seq] {
			t.Fatalf("duplicate seq %d", ev.Seq)
		}
		seen[ev.Seq] = true
		if ev.Seq != int64(i+1) {
			t.Fatalf("expected contiguous seq starting at 1, got %d at position %d", ev.Seq, i)
		}
		if ev.PrevHash != prevHash {
			t.Fatalf("chain broken at seq %d: prev_hash %q != expected %q", ev.Seq, ev.PrevHash, prevHash)
		}
		prevHash = ev.Hash
	}
}

func TestRecord_ProducesValidJSONLWithParamsPreserved(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := w.Record(Event{
		Action: "scale", Namespace: "default", ResourceKind: "Deployment", ResourceName: "api",
		Params:  map[string]any{"replicas_from": float64(3), "replicas_to": float64(5)},
		Outcome: "success",
	}); err != nil {
		t.Fatalf("Record: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var ev Event
	if err := json.Unmarshal(data, &ev); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if ev.Params["replicas_from"] != float64(3) || ev.Params["replicas_to"] != float64(5) {
		t.Errorf("params not round-tripped correctly: %+v", ev.Params)
	}
}

func TestNewNoop_RecordReturnsErrorWithoutPanicking(t *testing.T) {
	w := NewNoop()
	err := w.Record(Event{Action: "scale"})
	if err == nil {
		t.Error("expected NewNoop's Writer to return an error from Record")
	}
}

func TestReadEntries_ReturnsAllEntriesAcrossRotatedFilesInOrder(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := w.Record(Event{Action: "scale", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	if err := w.rotate(); err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if err := w.Record(Event{Action: "delete", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	if err := w.Record(Event{Action: "cordon_node", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}

	entries, err := ReadEntries(dir)
	if err != nil {
		t.Fatalf("ReadEntries: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries across both files, got %d", len(entries))
	}
	gotActions := []string{entries[0].Action, entries[1].Action, entries[2].Action}
	wantActions := []string{"scale", "delete", "cordon_node"}
	for i := range wantActions {
		if gotActions[i] != wantActions[i] {
			t.Errorf("expected chronological order %v, got %v", wantActions, gotActions)
			break
		}
	}
}

func TestReadEntries_MissingDirReturnsEmptyNotError(t *testing.T) {
	entries, err := ReadEntries(filepath.Join(t.TempDir(), "does-not-exist"))
	if err != nil {
		t.Fatalf("ReadEntries: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected no entries for a missing directory, got %d", len(entries))
	}
}

func TestDefaultDir_EndsInPodscapeAndDefaultPathIsInsideIt(t *testing.T) {
	dir := DefaultDir()
	if dir == "" || dir == "." {
		t.Fatalf("expected a resolved home-relative directory, got %q", dir)
	}
	if !strings.HasSuffix(dir, ".podscape") {
		t.Errorf("expected DefaultDir to end in .podscape, got %q", dir)
	}
	if filepath.Dir(DefaultPath()) != dir {
		t.Errorf("expected DefaultPath to live directly inside DefaultDir, got %q vs dir %q", DefaultPath(), dir)
	}
}

func TestRotate_ArchivesOldFileAndContinuesChain(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := w.Record(Event{Action: "scale", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	if err := w.Record(Event{Action: "delete", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	preRotateLastHash := w.lastHash

	if err := w.rotate(); err != nil {
		t.Fatalf("rotate: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	var archiveName string
	sawActive := false
	for _, e := range entries {
		if e.Name() == "audit.log" {
			sawActive = true
			continue
		}
		archiveName = e.Name()
	}
	if !sawActive {
		t.Error("expected a fresh audit.log to exist after rotation")
	}
	if archiveName == "" || !strings.HasPrefix(archiveName, "audit-") || !strings.HasSuffix(archiveName, ".log") {
		t.Errorf("expected an archive file named audit-<timestamp>.log, got %q", archiveName)
	}

	// The next entry written to the (now-fresh) active file must chain from
	// the archived file's last hash, not "genesis" — continuity across the
	// rotation boundary.
	if err := w.Record(Event{Action: "scale", Outcome: "success"}); err != nil {
		t.Fatalf("Record after rotate: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var ev Event
	if err := json.Unmarshal(bytesTrimSpace(data), &ev); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if ev.Seq != 1 {
		t.Errorf("expected seq to reset to 1 in the new file, got %d", ev.Seq)
	}
	if ev.PrevHash != preRotateLastHash {
		t.Errorf("expected new file's first entry to chain from the archived file's last hash %q, got %q", preRotateLastHash, ev.PrevHash)
	}
}

func TestRecord_AutoRotatesWhenFileExceedsSizeThreshold(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	// Simulate an already-large file without writing 50MB of real data.
	w.bytesWritten = rotateAtBytes + 1

	if err := w.Record(Event{Action: "scale", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	archived := false
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "audit-") {
			archived = true
		}
	}
	if !archived {
		t.Error("expected Record to have triggered rotation once bytesWritten exceeded the threshold")
	}
}
