package client

import (
	"os"
	"path/filepath"
	"testing"
)

// writeKubeconfig creates a minimal kubeconfig in a temp file with the given
// contexts and returns the file path.
func writeKubeconfig(t *testing.T, contexts []string, currentContext string) string {
	t.Helper()

	clusters := ""
	ctxBlocks := ""
	for _, ctx := range contexts {
		clusters += "- cluster:\n    server: https://fake-" + ctx + ":6443\n  name: " + ctx + "\n"
		ctxBlocks += "- context:\n    cluster: " + ctx + "\n    user: " + ctx + "\n  name: " + ctx + "\n"
	}

	yaml := "apiVersion: v1\nclusters:\n" + clusters +
		"contexts:\n" + ctxBlocks +
		"current-context: " + currentContext + "\n" +
		"kind: Config\npreferences: {}\nusers: []\n"

	f, err := os.CreateTemp(t.TempDir(), "kubeconfig-*.yaml")
	if err != nil {
		t.Fatalf("create temp kubeconfig: %v", err)
	}
	if _, err := f.WriteString(yaml); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}
	f.Close()
	return f.Name()
}

// ── ValidateContext ───────────────────────────────────────────────────────────

func TestValidateContext_ExistingContext_NoError(t *testing.T) {
	kube := writeKubeconfig(t, []string{"prod", "staging"}, "prod")

	if err := ValidateContext(kube, "prod"); err != nil {
		t.Errorf("expected no error for existing context, got: %v", err)
	}
	if err := ValidateContext(kube, "staging"); err != nil {
		t.Errorf("expected no error for existing context, got: %v", err)
	}
}

func TestValidateContext_MissingContext_ReturnsError(t *testing.T) {
	kube := writeKubeconfig(t, []string{"prod"}, "prod")

	err := ValidateContext(kube, "ghost")
	if err == nil {
		t.Error("expected error for missing context, got nil")
	}
}

func TestValidateContext_NonExistentFile_ReturnsError(t *testing.T) {
	err := ValidateContext("/does/not/exist.yaml", "any")
	if err == nil {
		t.Error("expected error when kubeconfig file is missing, got nil")
	}
}

// ── resolveKubeconfig ─────────────────────────────────────────────────────────

func TestResolveKubeconfig_ExplicitPathTakesPriority(t *testing.T) {
	t.Setenv("KUBECONFIG", "/should/be/ignored")

	got := resolveKubeconfig("/explicit/path")
	if got != "/explicit/path" {
		t.Errorf("expected explicit path to win, got %q", got)
	}
}

func TestResolveKubeconfig_KUBECONFIGUsedWhenNoExplicit(t *testing.T) {
	t.Setenv("KUBECONFIG", "/from/env")

	got := resolveKubeconfig("")
	if got != "/from/env" {
		t.Errorf("expected $KUBECONFIG to be used, got %q", got)
	}
}

func TestResolveKubeconfig_DefaultsToHomeDotKube(t *testing.T) {
	t.Setenv("KUBECONFIG", "")

	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home dir available")
	}
	want := filepath.Join(home, ".kube", "config")

	got := resolveKubeconfig("")
	if got != want {
		t.Errorf("expected default path %q, got %q", want, got)
	}
}
