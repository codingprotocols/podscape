package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/podscape/go-core/internal/audit"
)

// setupAuditLogHandlerTest points both audit.Global and auditDirFunc at the
// same fresh temp directory, so HandleAuditLog reads back exactly what the
// test writes, and restores both afterward.
func setupAuditLogHandlerTest(t *testing.T) {
	t.Helper()
	auditPath := setupAuditForTest(t) // sets audit.Global, restored via t.Cleanup
	dir := filepath.Dir(auditPath)
	origDirFunc := auditDirFunc
	auditDirFunc = func() string { return dir }
	t.Cleanup(func() { auditDirFunc = origDirFunc })
}

func TestHandleAuditLog_ReturnsEntriesNewestFirst(t *testing.T) {
	setupAuditLogHandlerTest(t)
	for _, action := range []string{"scale", "delete", "cordon_node"} {
		if err := audit.Global.Record(audit.Event{Action: action, Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	rr := httptest.NewRecorder()
	HandleAuditLog(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var entries []audit.Event
	if err := json.Unmarshal(rr.Body.Bytes(), &entries); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	// Newest first: the last-recorded action (cordon_node) comes back first.
	got := []string{entries[0].Action, entries[1].Action, entries[2].Action}
	want := []string{"cordon_node", "delete", "scale"}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("expected newest-first order %v, got %v", want, got)
			break
		}
	}
}

func TestHandleAuditLog_FiltersByActionAndOutcome(t *testing.T) {
	setupAuditLogHandlerTest(t)
	events := []audit.Event{
		{Action: "scale", Outcome: "success"},
		{Action: "scale", Outcome: "failure"},
		{Action: "delete", Outcome: "success"},
	}
	for _, ev := range events {
		if err := audit.Global.Record(ev); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/audit?action=scale&outcome=success", nil)
	rr := httptest.NewRecorder()
	HandleAuditLog(rr, req)

	var entries []audit.Event
	if err := json.Unmarshal(rr.Body.Bytes(), &entries); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 filtered entry, got %d: %+v", len(entries), entries)
	}
	if entries[0].Action != "scale" || entries[0].Outcome != "success" {
		t.Errorf("unexpected filtered entry: %+v", entries[0])
	}
}

func TestHandleAuditLog_RespectsLimit(t *testing.T) {
	setupAuditLogHandlerTest(t)
	for i := 0; i < 5; i++ {
		if err := audit.Global.Record(audit.Event{Action: "scale", Outcome: "success"}); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/audit?limit=2", nil)
	rr := httptest.NewRecorder()
	HandleAuditLog(rr, req)

	var entries []audit.Event
	if err := json.Unmarshal(rr.Body.Bytes(), &entries); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected limit=2 to cap the response at 2 entries, got %d", len(entries))
	}
}

func TestHandleAuditLog_NoEntriesReturnsEmptyArrayNotNull(t *testing.T) {
	setupAuditLogHandlerTest(t)

	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	rr := httptest.NewRecorder()
	HandleAuditLog(rr, req)

	if rr.Body.String() != "[]" {
		t.Errorf("expected an empty JSON array for no entries, got %q", rr.Body.String())
	}
}
