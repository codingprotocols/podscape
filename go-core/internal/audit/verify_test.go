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

func TestReadRecent_NewestFirstLimitAndFilters(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	// Record: scale(ok), delete(ok), scale(fail), cordon(ok) in that order.
	seq := []audit1{{"scale", "success"}, {"delete", "success"}, {"scale", "failure"}, {"cordon_node", "success"}}
	for _, e := range seq {
		if err := w.Record(Event{Action: e.action, Outcome: e.outcome}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	// Newest-first, unbounded.
	all, err := ReadRecent(dir, 0, "", "")
	if err != nil {
		t.Fatalf("ReadRecent all: %v", err)
	}
	gotActions := []string{}
	for _, e := range all {
		gotActions = append(gotActions, e.Action)
	}
	want := []string{"cordon_node", "scale", "delete", "scale"}
	if len(gotActions) != len(want) {
		t.Fatalf("expected %d entries, got %d (%v)", len(want), len(gotActions), gotActions)
	}
	for i := range want {
		if gotActions[i] != want[i] {
			t.Fatalf("newest-first mismatch: want %v, got %v", want, gotActions)
		}
	}

	// Limit stops early (newest 2).
	lim, err := ReadRecent(dir, 2, "", "")
	if err != nil {
		t.Fatalf("ReadRecent limit: %v", err)
	}
	if len(lim) != 2 || lim[0].Action != "cordon_node" || lim[1].Action != "scale" {
		t.Errorf("expected newest 2 [cordon_node scale], got %+v", lim)
	}

	// Action + outcome filters.
	f, err := ReadRecent(dir, 0, "scale", "failure")
	if err != nil {
		t.Fatalf("ReadRecent filter: %v", err)
	}
	if len(f) != 1 || f[0].Action != "scale" || f[0].Outcome != "failure" {
		t.Errorf("expected 1 scale/failure entry, got %+v", f)
	}

	// Empty dir -> empty (non-nil) slice.
	empty, err := ReadRecent(t.TempDir(), 0, "", "")
	if err != nil {
		t.Fatalf("ReadRecent empty: %v", err)
	}
	if empty == nil || len(empty) != 0 {
		t.Errorf("expected empty non-nil slice, got %#v", empty)
	}
}

func TestReadRecent_SpansRotationNewestFirst(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	w, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := w.Record(Event{Action: "archived", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}
	if err := w.rotate(); err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if err := w.Record(Event{Action: "active", Outcome: "success"}); err != nil {
		t.Fatalf("Record: %v", err)
	}

	got, err := ReadRecent(dir, 0, "", "")
	if err != nil {
		t.Fatalf("ReadRecent: %v", err)
	}
	if len(got) != 2 || got[0].Action != "active" || got[1].Action != "archived" {
		t.Errorf("expected newest-first across rotation [active archived], got %+v", got)
	}

	// A limit of 1 should read only the active file.
	one, err := ReadRecent(dir, 1, "", "")
	if err != nil {
		t.Fatalf("ReadRecent limit 1: %v", err)
	}
	if len(one) != 1 || one[0].Action != "active" {
		t.Errorf("expected just the newest [active], got %+v", one)
	}
}

type audit1 struct{ action, outcome string }

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
