package handlers

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// auditedHandlers is the source of truth for which HandleXxx functions in
// operations.go are required to call audit.Global.Record(...). Keep this in
// sync with the "Actions Captured" table in
// docs/superpowers/specs/2026-09-25-audit-log-design.md.
var auditedHandlers = []string{
	"HandleScale",
	"HandleDelete",
	"HandleApplyYAML",
	"HandleRolloutRestart",
	"HandleRolloutUndo",
	"HandleCordonNode",
	"HandleDrainNode",
	"HandleTriggerCronJob",
	"HandleCreateDebugPod",
	"HandleCPTo",
	"HandleCPFrom",
	"HandleExec",
}

// nonAuditedHandlers are HandleXxx functions in operations.go that are
// intentionally NOT audited (reads, or actions explicitly out of scope for
// this version of the audit log — see the spec's Non-Goals).
var nonAuditedHandlers = []string{
	"HandleGetYAML",
	"HandleGetSecretValue",
	"HandleExecOneShot",
	"HandleRolloutHistory",
}

var handleFuncNameRE = regexp.MustCompile(`(?m)^func (Handle\w+)\(`)

// extractFuncBody returns the full source text of the named top-level
// function in src, from its "func Name(" line through its matching closing
// brace, by tracking brace depth.
func extractFuncBody(t *testing.T, src, name string) string {
	t.Helper()
	idx := strings.Index(src, "func "+name+"(")
	if idx == -1 {
		t.Fatalf("function %s not found in operations.go", name)
	}
	braceDepth := 0
	started := false
	end := idx
	for i := idx; i < len(src); i++ {
		switch src[i] {
		case '{':
			braceDepth++
			started = true
		case '}':
			braceDepth--
		}
		if started && braceDepth == 0 {
			end = i + 1
			break
		}
	}
	return src[idx:end]
}

func TestAuditCoverage_AllMutatingHandlersRecordAuditEvents(t *testing.T) {
	src, err := os.ReadFile("operations.go")
	if err != nil {
		t.Fatalf("reading operations.go: %v", err)
	}
	body := string(src)

	// Every func Handle* in the file must be classified into exactly one of
	// auditedHandlers or nonAuditedHandlers — this is what catches a new
	// mutating handler being added without an explicit audit decision.
	allMatches := handleFuncNameRE.FindAllStringSubmatch(body, -1)
	found := make(map[string]bool, len(allMatches))
	for _, m := range allMatches {
		found[m[1]] = true
	}
	classified := make(map[string]bool, len(auditedHandlers)+len(nonAuditedHandlers))
	for _, n := range auditedHandlers {
		classified[n] = true
	}
	for _, n := range nonAuditedHandlers {
		classified[n] = true
	}
	for name := range found {
		if !classified[name] {
			t.Errorf("handler %s in operations.go is not classified as audited or non-audited — add it to auditedHandlers or nonAuditedHandlers in audit_coverage_test.go", name)
		}
	}
	for name := range classified {
		if !found[name] {
			t.Errorf("handler %s is listed in audit_coverage_test.go but no longer exists in operations.go — remove it from the list", name)
		}
	}

	// Every audited handler's body must actually call audit.Global.Record(.
	for _, name := range auditedHandlers {
		fn := extractFuncBody(t, body, name)
		if !strings.Contains(fn, "audit.Global.Record(") {
			t.Errorf("handler %s is listed as audited but its body has no audit.Global.Record( call", name)
		}
	}
}
