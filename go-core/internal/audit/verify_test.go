package audit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestVerify_CleanChainPasses(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	for i := 0; i < 5; i++ {
		if err := w.Record(Event{Action: "delete", ResourceName: "pod", Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	ok, brokenAt, err := Verify(path)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Errorf("expected clean chain to verify OK, broken at seq %d", brokenAt)
	}
}

func TestVerify_MissingFileIsClean(t *testing.T) {
	ok, _, err := Verify(filepath.Join(t.TempDir(), "does-not-exist.log"))
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Error("expected a missing file to verify as clean (nothing to verify)")
	}
}

func TestVerify_ModifiedFieldBreaksChain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := w.Record(Event{Action: "delete", ResourceName: fmt.Sprintf("pod-%d", i), Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	lines := splitNonEmptyLines(data)
	var second Event
	if err := json.Unmarshal(lines[1], &second); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	second.Outcome = "failure" // tamper: flip a real field without touching hash/prev_hash
	tampered, err := json.Marshal(second)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	lines[1] = tampered

	rebuilt := bytesJoin(lines, '\n')
	if err := os.WriteFile(path, rebuilt, 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	ok, brokenAt, err := Verify(path)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if ok {
		t.Fatal("expected tampered chain to fail verification")
	}
	if brokenAt != second.Seq {
		t.Errorf("expected break reported at seq %d, got %d", second.Seq, brokenAt)
	}
}

func TestVerifyDir_CleanMultiFileChainPasses(t *testing.T) {
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

	ok, brokenAtFile, brokenAtSeq, err := VerifyDir(dir)
	if err != nil {
		t.Fatalf("VerifyDir: %v", err)
	}
	if !ok {
		t.Errorf("expected clean multi-file chain to verify OK, broke at %s seq %d", brokenAtFile, brokenAtSeq)
	}
}

func TestVerifyDir_MissingDirIsClean(t *testing.T) {
	ok, _, _, err := VerifyDir(filepath.Join(t.TempDir(), "does-not-exist"))
	if err != nil {
		t.Fatalf("VerifyDir: %v", err)
	}
	if !ok {
		t.Error("expected a missing directory to verify as clean")
	}
}

func TestVerifyDir_TamperedArchiveBreaksChain(t *testing.T) {
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

	// Tamper with the archived (rotated-out) file, not the active one.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	var archivePath string
	for _, e := range entries {
		if e.Name() != "audit.log" {
			archivePath = filepath.Join(dir, e.Name())
		}
	}
	data, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var ev Event
	if err := json.Unmarshal(bytesTrimSpace(data), &ev); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	ev.Outcome = "failure" // tamper
	tampered, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(archivePath, append(tampered, '\n'), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	ok, brokenAtFile, _, err := VerifyDir(dir)
	if err != nil {
		t.Fatalf("VerifyDir: %v", err)
	}
	if ok {
		t.Fatal("expected a tampered archive to fail multi-file verification")
	}
	if brokenAtFile != filepath.Base(archivePath) {
		t.Errorf("expected break reported at archive %s, got %s", filepath.Base(archivePath), brokenAtFile)
	}
}

func TestVerify_DeletedEntryBreaksChain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := w.Record(Event{Action: "delete", ResourceName: fmt.Sprintf("pod-%d", i), Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	lines := splitNonEmptyLines(data)
	// Remove the middle line entirely.
	rebuilt := bytesJoin([][]byte{lines[0], lines[2]}, '\n')
	if err := os.WriteFile(path, rebuilt, 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	ok, _, err := Verify(path)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if ok {
		t.Fatal("expected a chain with a deleted entry to fail verification")
	}
}

func TestVerify_TrailingPartialLineTolerated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := w.Record(Event{Action: "delete", ResourceName: fmt.Sprintf("pod-%d", i), Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	// Simulate a crash mid-write: a truncated, unterminated final line
	// appended after a complete, valid chain.
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if _, err := f.WriteString(`{"seq":99,"prev_hash":"garb`); err != nil {
		t.Fatalf("write partial: %v", err)
	}
	f.Close()

	ok, brokenAt, err := Verify(path)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Errorf("expected a benign trailing partial line to be tolerated, broke at seq %d", brokenAt)
	}
}

func TestVerify_InteriorUnparsableLineBreaksChain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := w.Record(Event{Action: "delete", ResourceName: fmt.Sprintf("pod-%d", i), Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	// Corrupt the middle line into garbage: an unparsable line with valid
	// lines after it is interior corruption, not a benign crash tail.
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	lines := splitNonEmptyLines(data)
	lines[1] = []byte(`{not valid json`)
	if err := os.WriteFile(path, append(bytesJoin(lines, '\n'), '\n'), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	ok, _, err := Verify(path)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if ok {
		t.Fatal("expected an interior unparsable line to fail verification")
	}
}

// bytesJoin avoids importing "bytes" solely for Join in this test file.
func bytesJoin(parts [][]byte, sep byte) []byte {
	var out []byte
	for i, p := range parts {
		if i > 0 {
			out = append(out, sep)
		}
		out = append(out, p...)
	}
	return out
}
