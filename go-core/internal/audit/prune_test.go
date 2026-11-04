package audit

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPrune_DeletesArchivesOlderThanMaxAge(t *testing.T) {
	dir := t.TempDir()

	oldArchive := filepath.Join(dir, "audit-20200101T000000Z.log")
	recentArchive := filepath.Join(dir, "audit-"+time.Now().UTC().Format("20060102T150405Z")+".log")

	for _, p := range []string{oldArchive, recentArchive} {
		if err := os.WriteFile(p, []byte(`{"seq":1}`+"\n"), 0600); err != nil {
			t.Fatalf("WriteFile: %v", err)
		}
	}
	activePath := filepath.Join(dir, "audit.log")
	if err := os.WriteFile(activePath, []byte(`{"seq":1}`+"\n"), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	deleted, err := Prune(dir, DefaultRetention)
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}
	if len(deleted) != 1 || deleted[0] != oldArchive {
		t.Errorf("expected Prune to delete exactly [%s], got %v", oldArchive, deleted)
	}

	if _, err := os.Stat(oldArchive); !os.IsNotExist(err) {
		t.Error("expected the old archive to be deleted")
	}
	if _, err := os.Stat(recentArchive); err != nil {
		t.Error("expected the recent archive to survive pruning")
	}
	if _, err := os.Stat(activePath); err != nil {
		t.Error("expected the active audit.log to never be pruned")
	}
}

func TestPrune_MissingDirReturnsNoError(t *testing.T) {
	deleted, err := Prune(filepath.Join(t.TempDir(), "does-not-exist"), DefaultRetention)
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}
	if len(deleted) != 0 {
		t.Errorf("expected no deletions for a missing directory, got %v", deleted)
	}
}

func TestPrune_IgnoresFilesNotMatchingArchiveNamingConvention(t *testing.T) {
	dir := t.TempDir()
	// Not an audit archive — must be left alone regardless of age.
	other := filepath.Join(dir, "settings.json")
	if err := os.WriteFile(other, []byte(`{}`), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := os.Chtimes(other, time.Now().Add(-365*24*time.Hour), time.Now().Add(-365*24*time.Hour)); err != nil {
		t.Fatalf("Chtimes: %v", err)
	}

	deleted, err := Prune(dir, DefaultRetention)
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}
	if len(deleted) != 0 {
		t.Errorf("expected Prune to ignore non-audit files, got %v", deleted)
	}
	if _, err := os.Stat(other); err != nil {
		t.Error("expected the unrelated file to survive")
	}
}
