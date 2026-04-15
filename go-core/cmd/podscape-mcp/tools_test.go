package main

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/podscape/go-core/internal/client"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ── argStr / argFloat / argBool ───────────────────────────────────────────────

func makeReq(kv map[string]interface{}) mcp.CallToolRequest {
	return mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Arguments: kv,
		},
	}
}

func TestArgStr(t *testing.T) {
	req := makeReq(map[string]interface{}{"key": "value", "num": 42.0})
	if got := argStr(req, "key"); got != "value" {
		t.Errorf("argStr: expected %q, got %q", "value", got)
	}
	if got := argStr(req, "missing"); got != "" {
		t.Errorf("argStr missing key: expected empty, got %q", got)
	}
	if got := argStr(req, "num"); got != "" {
		t.Errorf("argStr wrong type: expected empty, got %q", got)
	}
}

func TestArgFloat(t *testing.T) {
	req := makeReq(map[string]interface{}{"n": 3.14, "s": "hello"})
	v, ok := argFloat(req, "n")
	if !ok || v != 3.14 {
		t.Errorf("argFloat: expected (3.14, true), got (%v, %v)", v, ok)
	}
	_, ok = argFloat(req, "missing")
	if ok {
		t.Error("argFloat missing key: expected false")
	}
	_, ok = argFloat(req, "s")
	if ok {
		t.Error("argFloat wrong type: expected false")
	}
}

func TestArgBool(t *testing.T) {
	req := makeReq(map[string]interface{}{"flag": true, "s": "true"})
	if got := argBool(req, "flag"); !got {
		t.Error("argBool: expected true")
	}
	if got := argBool(req, "missing"); got {
		t.Error("argBool missing key: expected false")
	}
	if got := argBool(req, "s"); got {
		t.Error("argBool string value: expected false (not a real bool)")
	}
}

// ── scanPods ──────────────────────────────────────────────────────────────────

func boolp(v bool) *bool   { return &v }
func int64p(v int64) *int64 { return &v }

func makePod(name string, mutateFn func(*corev1.Pod)) corev1.Pod {
	p := corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: name}}
	p.Spec.Containers = []corev1.Container{{Name: "app"}}
	if mutateFn != nil {
		mutateFn(&p)
	}
	return p
}

func findingsWithIssue(findings []securityFinding, issue string) []securityFinding {
	var out []securityFinding
	for _, f := range findings {
		if f.Issue == issue {
			out = append(out, f)
		}
	}
	return out
}

func TestScanPods_NoSecurityContext(t *testing.T) {
	pod := makePod("pod1", nil) // no SecurityContext set
	findings := scanPods([]corev1.Pod{pod})
	warns := findingsWithIssue(findings, "No SecurityContext set")
	if len(warns) != 1 {
		t.Errorf("expected 1 WARN for no SecurityContext, got %d", len(warns))
	}
}

func TestScanPods_PrivilegedContainer(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			Privileged: boolp(true),
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	crits := findingsWithIssue(findings, "Privileged container")
	if len(crits) != 1 || crits[0].Severity != "CRITICAL" {
		t.Errorf("expected 1 CRITICAL privileged finding, got %v", crits)
	}
}

func TestScanPods_RunAsRootViaContainerSC(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(0)
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsUser: &uid,
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	highs := findingsWithIssue(findings, "Running as root")
	if len(highs) != 1 {
		t.Errorf("expected 1 HIGH running-as-root finding, got %d", len(highs))
	}
}

func TestScanPods_RunAsNonRootSuppressesRootFinding(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot: boolp(true),
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	highs := findingsWithIssue(findings, "Running as root")
	if len(highs) != 0 {
		t.Errorf("expected no root findings when RunAsNonRoot=true, got %d", len(highs))
	}
}

func TestScanPods_PodLevelRunAsRoot(t *testing.T) {
	// No container-level SC; pod-level sets RunAsUser=0.
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(0)
		p.Spec.SecurityContext = &corev1.PodSecurityContext{RunAsUser: &uid}
		// container has no SecurityContext
	})
	findings := scanPods([]corev1.Pod{pod})
	podRootFindings := findingsWithIssue(findings, "Running as root (pod-level)")
	if len(podRootFindings) != 1 {
		t.Errorf("expected pod-level root finding, got %v", findings)
	}
}

func TestScanPods_PodLevelRunAsNonRootInherited(t *testing.T) {
	// Pod-level RunAsNonRoot=true; container has explicit SC but no RunAsNonRoot override.
	pod := makePod("pod1", func(p *corev1.Pod) {
		p.Spec.SecurityContext = &corev1.PodSecurityContext{RunAsNonRoot: boolp(true)}
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{}
	})
	findings := scanPods([]corev1.Pod{pod})
	highs := findingsWithIssue(findings, "Running as root")
	if len(highs) != 0 {
		t.Errorf("pod-level RunAsNonRoot should suppress root finding, got %d HIGH findings", len(highs))
	}
}

func TestScanPods_HostNamespaces(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		p.Spec.HostNetwork = true
		p.Spec.HostPID = true
		p.Spec.HostIPC = true
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot: boolp(true),
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	if len(findingsWithIssue(findings, "Host networking enabled")) != 1 {
		t.Error("expected host networking finding")
	}
	if len(findingsWithIssue(findings, "Host PID namespace enabled")) != 1 {
		t.Error("expected host PID finding")
	}
	if len(findingsWithIssue(findings, "Host IPC namespace enabled")) != 1 {
		t.Error("expected host IPC finding")
	}
}

func TestScanPods_NoResourceLimits(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(1000)
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot: boolp(true),
			RunAsUser:    &uid,
		}
		// No resource limits set — expect WARN
	})
	findings := scanPods([]corev1.Pod{pod})
	warns := findingsWithIssue(findings, "No resource limits set")
	if len(warns) != 1 {
		t.Errorf("expected 1 WARN for no resource limits, got %d", len(warns))
	}
}

func TestScanPods_ResourceLimitsSuppressWarning(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(1000)
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot: boolp(true),
			RunAsUser:    &uid,
		}
		p.Spec.Containers[0].Resources = corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("100m"),
				corev1.ResourceMemory: resource.MustParse("128Mi"),
			},
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	warns := findingsWithIssue(findings, "No resource limits set")
	if len(warns) != 0 {
		t.Errorf("expected no resource-limits warning when limits are set, got %d", len(warns))
	}
}

func TestScanPods_CleanPod(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(1000)
		falseVal := false
		trueVal := true
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot:             boolp(true),
			RunAsUser:                &uid,
			AllowPrivilegeEscalation: &falseVal,
			ReadOnlyRootFilesystem:   &trueVal,
		}
		p.Spec.Containers[0].Resources = corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("100m"),
				corev1.ResourceMemory: resource.MustParse("128Mi"),
			},
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	if len(findings) != 0 {
		t.Errorf("expected 0 findings for a clean pod, got %d: %v", len(findings), findings)
	}
}

func TestScanPods_EmptyInput(t *testing.T) {
	findings := scanPods(nil)
	if findings != nil {
		t.Errorf("expected nil findings for empty input, got %v", findings)
	}
}

// ── New security scan checks (Tasks 5) ────────────────────────────────────────

func TestScanPods_AllowPrivilegeEscalationNotFalse(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(1000)
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot: boolp(true),
			RunAsUser:    &uid,
			// AllowPrivilegeEscalation intentionally not set → expect WARN
		}
		p.Spec.Containers[0].Resources = corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("100m"),
				corev1.ResourceMemory: resource.MustParse("128Mi"),
			},
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	warns := findingsWithIssue(findings, "allowPrivilegeEscalation not set to false")
	if len(warns) != 1 || warns[0].Severity != "WARN" {
		t.Errorf("expected 1 WARN for allowPrivilegeEscalation, got %v", warns)
	}
}

func TestScanPods_AllowPrivilegeEscalationExplicitFalse(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(1000)
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot:             boolp(true),
			RunAsUser:                &uid,
			AllowPrivilegeEscalation: boolp(false),
		}
		p.Spec.Containers[0].Resources = corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("100m"),
				corev1.ResourceMemory: resource.MustParse("128Mi"),
			},
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	warns := findingsWithIssue(findings, "allowPrivilegeEscalation not set to false")
	if len(warns) != 0 {
		t.Errorf("expected no warns when AllowPrivilegeEscalation=false, got %d", len(warns))
	}
}

func TestScanPods_ReadOnlyRootFilesystemNotTrue(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(1000)
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot:             boolp(true),
			RunAsUser:                &uid,
			AllowPrivilegeEscalation: boolp(false),
			// ReadOnlyRootFilesystem intentionally not set → expect WARN
		}
		p.Spec.Containers[0].Resources = corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("100m"),
				corev1.ResourceMemory: resource.MustParse("128Mi"),
			},
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	warns := findingsWithIssue(findings, "readOnlyRootFilesystem not set to true")
	if len(warns) != 1 || warns[0].Severity != "WARN" {
		t.Errorf("expected 1 WARN for readOnlyRootFilesystem, got %v", warns)
	}
}

func TestScanPods_ReadOnlyRootFilesystemTrue(t *testing.T) {
	pod := makePod("pod1", func(p *corev1.Pod) {
		uid := int64(1000)
		p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
			RunAsNonRoot:             boolp(true),
			RunAsUser:                &uid,
			AllowPrivilegeEscalation: boolp(false),
			ReadOnlyRootFilesystem:   boolp(true),
		}
		p.Spec.Containers[0].Resources = corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("100m"),
				corev1.ResourceMemory: resource.MustParse("128Mi"),
			},
		}
	})
	findings := scanPods([]corev1.Pod{pod})
	warns := findingsWithIssue(findings, "readOnlyRootFilesystem not set to true")
	if len(warns) != 0 {
		t.Errorf("expected no warns when ReadOnlyRootFilesystem=true, got %d", len(warns))
	}
}

func TestScanPods_DangerousCapabilities(t *testing.T) {
	for _, cap := range []corev1.Capability{"NET_ADMIN", "SYS_ADMIN", "SYS_PTRACE", "ALL"} {
		cap := cap // capture loop var
		pod := makePod("pod1", func(p *corev1.Pod) {
			uid := int64(1000)
			p.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{
				RunAsNonRoot:             boolp(true),
				RunAsUser:                &uid,
				AllowPrivilegeEscalation: boolp(false),
				ReadOnlyRootFilesystem:   boolp(true),
				Capabilities: &corev1.Capabilities{
					Add: []corev1.Capability{cap},
				},
			}
			p.Spec.Containers[0].Resources = corev1.ResourceRequirements{
				Limits: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("100m"),
					corev1.ResourceMemory: resource.MustParse("128Mi"),
				},
			}
		})
		findings := scanPods([]corev1.Pod{pod})
		issue := fmt.Sprintf("Dangerous capability: %s", cap)
		highs := findingsWithIssue(findings, issue)
		if len(highs) != 1 || highs[0].Severity != "HIGH" {
			t.Errorf("cap %s: expected 1 HIGH finding, got %v", cap, highs)
		}
	}
}

// ── ValidateContext ───────────────────────────────────────────────────────────

func TestValidateContext_ExistingContext(t *testing.T) {
	kubeconfig := writeTempKubeconfig(t, "my-context")
	if err := client.ValidateContext(kubeconfig, "my-context"); err != nil {
		t.Errorf("expected no error for existing context, got: %v", err)
	}
}

func TestValidateContext_MissingContext(t *testing.T) {
	kubeconfig := writeTempKubeconfig(t, "my-context")
	if err := client.ValidateContext(kubeconfig, "nonexistent"); err == nil {
		t.Error("expected error for missing context, got nil")
	}
}

func writeTempKubeconfig(t *testing.T, contextName string) string {
	t.Helper()
	content := fmt.Sprintf(`apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://localhost:6443
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: %s
current-context: %s
users:
- name: test-user
  user: {}
`, contextName, contextName)
	f, err := os.CreateTemp(t.TempDir(), "kubeconfig-*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return f.Name()
}

// ── cronJobManualName ─────────────────────────────────────────────────────────

func TestCronJobManualName_Format(t *testing.T) {
	name := cronJobManualName("my-job")
	if !strings.HasPrefix(name, "my-job-manual-") {
		t.Errorf("expected prefix 'my-job-manual-', got %q", name)
	}
	suffix := strings.TrimPrefix(name, "my-job-manual-")
	if len(suffix) < 9 {
		t.Errorf("expected unix timestamp suffix of length >= 9, got %q", suffix)
	}
	for _, ch := range suffix {
		if ch < '0' || ch > '9' {
			t.Errorf("expected all-digit suffix, got %q", suffix)
			break
		}
	}
}

func TestCronJobManualName_DifferentInputs(t *testing.T) {
	n1 := cronJobManualName("job-a")
	n2 := cronJobManualName("job-b")
	if !strings.HasPrefix(n1, "job-a-manual-") {
		t.Errorf("expected job-a prefix, got %q", n1)
	}
	if !strings.HasPrefix(n2, "job-b-manual-") {
		t.Errorf("expected job-b prefix, got %q", n2)
	}
}
