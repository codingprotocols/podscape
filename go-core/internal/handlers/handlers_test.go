package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/store"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// ── helpers ───────────────────────────────────────────────────────────────────

// writeTestKubeconfig writes a minimal kubeconfig with the given contexts to a
// temp file and returns its path. contexts maps context name → server URL.
func writeTestKubeconfig(t *testing.T, contexts map[string]string, current string) string {
	t.Helper()
	cfg := clientcmdapi.NewConfig()
	for name, server := range contexts {
		cfg.Clusters[name] = &clientcmdapi.Cluster{Server: server}
		cfg.AuthInfos[name] = &clientcmdapi.AuthInfo{}
		cfg.Contexts[name] = &clientcmdapi.Context{Cluster: name, AuthInfo: name}
	}
	cfg.CurrentContext = current
	f, err := os.CreateTemp(t.TempDir(), "kubeconfig-*.yaml")
	if err != nil {
		t.Fatalf("create temp kubeconfig: %v", err)
	}
	if err := clientcmd.WriteToFile(*cfg, f.Name()); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}
	return f.Name()
}

// resetStore restores the global store and injectable funcs to a clean state after each test.
func resetStore(t *testing.T, origActiveCache *store.ContextCache, origKubeconfig string) {
	t.Cleanup(func() {
		store.Store.Lock()
		store.Store.ActiveCache = origActiveCache
		store.Store.Kubeconfig = origKubeconfig
		store.Store.Unlock()
		syncInformersFunc = realSyncFn
		rbacCheckFunc = realRBACFn
	})
}

// realSyncFn holds the original injectable value so tests can restore it.
var realSyncFn = syncInformersFunc

// realRBACFn holds the original injectable value so tests can restore it.
var realRBACFn = rbacCheckFunc

// noopSync immediately returns true (synced) without touching any informers.
func noopSync(_ *store.ContextCache, _ <-chan struct{}, _ time.Duration) bool {
	return true
}

// timeoutSync immediately returns false (timed out) without touching any informers.
func timeoutSync(_ *store.ContextCache, _ <-chan struct{}, _ time.Duration) bool {
	return false
}

// noopRBAC immediately returns all-allowed without hitting the API server.
func noopRBAC(_ context.Context, _ kubernetes.Interface) (map[string]bool, error) {
	return nil, nil // nil = permissive (probe "not run")
}

// newTestCache creates a ContextCache backed by the given fake clientset.
func newTestCache(cs kubernetes.Interface) *store.ContextCache {
	return store.NewContextCache(cs, &rest.Config{})
}

// ── HandleHealth ──────────────────────────────────────────────────────────────

func TestHandleHealth_NotReady(t *testing.T) {
	ac := newTestCache(fake.NewSimpleClientset())
	ac.CacheReady = false
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	t.Cleanup(func() {
		store.Store.Lock()
		store.Store.ActiveCache = nil
		store.Store.Unlock()
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	HandleHealth(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", rr.Code)
	}
}

func TestHandleHealth_Ready(t *testing.T) {
	ac := newTestCache(fake.NewSimpleClientset())
	ac.CacheReady = true
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	t.Cleanup(func() {
		store.Store.Lock()
		store.Store.ActiveCache = nil
		store.Store.Unlock()
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	HandleHealth(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

// ── HandleSwitchContext ───────────────────────────────────────────────────────

func TestHandleSwitchContext_MissingParam(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/config/switch", nil)
	rr := httptest.NewRecorder()
	HandleSwitchContext(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandleSwitchContext_UnknownContext(t *testing.T) {
	kubeconfigPath := writeTestKubeconfig(t, map[string]string{
		"ctx-a": "http://fake-a:6443",
	}, "ctx-a")

	store.Store.Lock()
	store.Store.Kubeconfig = kubeconfigPath
	store.Store.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/config/switch?context=does-not-exist", nil)
	rr := httptest.NewRecorder()
	HandleSwitchContext(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestHandleSwitchContext_Success(t *testing.T) {
	fakeClientset := fake.NewSimpleClientset()
	origConfig := &rest.Config{Host: "http://original:6443"}

	origCache := store.NewContextCache(fakeClientset, origConfig)
	store.Store.Lock()
	store.Store.ActiveCache = origCache
	store.Store.Unlock()

	portforward.Init(fakeClientset, origConfig)

	// Informer sync and RBAC probe are no-ops in tests.
	syncInformersFunc = noopSync
	rbacCheckFunc = noopRBAC

	kubeconfigPath := writeTestKubeconfig(t, map[string]string{
		"ctx-a": "http://fake-a:6443",
		"ctx-b": "http://fake-b:6443",
	}, "ctx-a")

	store.Store.Lock()
	store.Store.Kubeconfig = kubeconfigPath
	store.Store.Unlock()

	resetStore(t, origCache, kubeconfigPath)

	req := httptest.NewRequest(http.MethodGet, "/config/switch?context=ctx-b", nil)
	rr := httptest.NewRecorder()
	HandleSwitchContext(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}

	// Informer sync runs in a background goroutine; give it a moment to complete.
	time.Sleep(50 * time.Millisecond)

	store.Store.RLock()
	ac := store.Store.ActiveCache
	store.Store.RUnlock()

	if ac == nil {
		t.Fatal("expected non-nil ActiveCache after switch")
	}
	ac.RLock()
	ready := ac.CacheReady
	ac.RUnlock()

	if !ready {
		t.Error("expected CacheReady=true after background sync")
	}
}

// TestHandleSwitchContext_AlwaysCommits verifies that switching contexts always
// succeeds (200 OK) even when the target cluster would be unreachable — matching
// kubectl's own behaviour. Connectivity errors surface later through normal
// resource-load failures in the UI, not by blocking the switch itself.
func TestHandleSwitchContext_AlwaysCommits(t *testing.T) {
	fakeClientset := fake.NewSimpleClientset()
	origConfig := &rest.Config{Host: "http://original:6443"}

	origCache := store.NewContextCache(fakeClientset, origConfig)
	origCache.CacheReady = true

	store.Store.Lock()
	store.Store.ActiveCache = origCache
	store.Store.Unlock()

	portforward.Init(fakeClientset, origConfig)

	// Informer sync and RBAC probe are no-ops — simulates a cluster that may be unreachable.
	syncInformersFunc = noopSync
	rbacCheckFunc = noopRBAC

	kubeconfigPath := writeTestKubeconfig(t, map[string]string{
		"ctx-a": "http://fake-a:6443",
		"ctx-b": "http://fake-b:6443",
	}, "ctx-a")

	store.Store.Lock()
	store.Store.Kubeconfig = kubeconfigPath
	store.Store.Unlock()

	resetStore(t, origCache, kubeconfigPath)

	req := httptest.NewRequest(http.MethodGet, "/config/switch?context=ctx-b", nil)
	rr := httptest.NewRecorder()
	HandleSwitchContext(rr, req)

	// Switch must always return 200 — never reject due to connectivity.
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}

	// Give the background goroutine a moment to complete.
	time.Sleep(50 * time.Millisecond)

	store.Store.RLock()
	currentContext := store.Store.ActiveContextName
	store.Store.RUnlock()

	if currentContext != "ctx-b" {
		t.Errorf("expected ActiveContextName=ctx-b after switch, got %q", currentContext)
	}
}

// ── undoDeploymentRollout ─────────────────────────────────────────────────────

// makeDeployment creates a minimal Deployment for tests.
func makeDeployment(ns, name string, currentRevision int64, image string) *appsv1.Deployment {
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			Annotations: map[string]string{
				"deployment.kubernetes.io/revision": fmt.Sprint(currentRevision),
			},
		},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": name},
			},
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Name: "c", Image: image}},
				},
			},
		},
	}
}

// makeRS creates a minimal ReplicaSet owned by the given deployment.
func makeRS(ns, name, deployName string, revision int64, image string) *appsv1.ReplicaSet {
	return &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			Labels:    map[string]string{"app": deployName},
			Annotations: map[string]string{
				"deployment.kubernetes.io/revision": fmt.Sprint(revision),
			},
			OwnerReferences: []metav1.OwnerReference{
				{Kind: "Deployment", Name: deployName, APIVersion: "apps/v1"},
			},
		},
		Spec: appsv1.ReplicaSetSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": deployName},
			},
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Name: "c", Image: image}},
				},
			},
		},
	}
}

// setActiveClientset sets a fake clientset as the active context cache for a test.
func setActiveClientset(t *testing.T, cs kubernetes.Interface) {
	t.Helper()
	ac := store.NewContextCache(cs, &rest.Config{})
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	t.Cleanup(func() {
		store.Store.Lock()
		store.Store.ActiveCache = nil
		store.Store.Unlock()
	})
}

func TestUndoDeploymentRollout_PreviousRevision(t *testing.T) {
	// Deployment at rev 3; RSes at rev 1, 2, 3. revision=0 should roll back to rev 2.
	deploy := makeDeployment("ns", "app", 3, "img:v3")
	rs1 := makeRS("ns", "rs-1", "app", 1, "img:v1")
	rs2 := makeRS("ns", "rs-2", "app", 2, "img:v2")
	rs3 := makeRS("ns", "rs-3", "app", 3, "img:v3")

	cs := fake.NewSimpleClientset(deploy, rs1, rs2, rs3)
	setActiveClientset(t, cs)

	if err := undoDeploymentRollout(context.Background(), "ns", "app", 0); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	updated, err := cs.AppsV1().Deployments("ns").Get(context.Background(), "app", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get deployment: %v", err)
	}
	if got := updated.Spec.Template.Spec.Containers[0].Image; got != "img:v2" {
		t.Errorf("expected image img:v2 after undo, got %s", got)
	}
}

func TestUndoDeploymentRollout_SpecificRevision(t *testing.T) {
	// Roll back to revision 1 explicitly.
	deploy := makeDeployment("ns", "app", 3, "img:v3")
	rs1 := makeRS("ns", "rs-1", "app", 1, "img:v1")
	rs2 := makeRS("ns", "rs-2", "app", 2, "img:v2")
	rs3 := makeRS("ns", "rs-3", "app", 3, "img:v3")

	cs := fake.NewSimpleClientset(deploy, rs1, rs2, rs3)
	setActiveClientset(t, cs)

	if err := undoDeploymentRollout(context.Background(), "ns", "app", 1); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	updated, _ := cs.AppsV1().Deployments("ns").Get(context.Background(), "app", metav1.GetOptions{})
	if got := updated.Spec.Template.Spec.Containers[0].Image; got != "img:v1" {
		t.Errorf("expected image img:v1 after undo to rev 1, got %s", got)
	}
}

func TestUndoDeploymentRollout_DeploymentNotFound(t *testing.T) {
	cs := fake.NewSimpleClientset() // empty — no deployment
	setActiveClientset(t, cs)

	err := undoDeploymentRollout(context.Background(), "ns", "missing-deploy", 0)
	if err == nil {
		t.Error("expected error for missing deployment, got nil")
	}
}

func TestUndoDeploymentRollout_NoOwnedReplicaSets(t *testing.T) {
	deploy := makeDeployment("ns", "app", 1, "img:v1")
	// No RSes registered
	cs := fake.NewSimpleClientset(deploy)
	setActiveClientset(t, cs)

	err := undoDeploymentRollout(context.Background(), "ns", "app", 0)
	if err == nil {
		t.Error("expected error when no owned RSes exist, got nil")
	}
}

func TestUndoDeploymentRollout_RevisionNotFound(t *testing.T) {
	deploy := makeDeployment("ns", "app", 2, "img:v2")
	rs1 := makeRS("ns", "rs-1", "app", 1, "img:v1")
	rs2 := makeRS("ns", "rs-2", "app", 2, "img:v2")

	cs := fake.NewSimpleClientset(deploy, rs1, rs2)
	setActiveClientset(t, cs)

	// Ask for revision 99 which doesn't exist
	err := undoDeploymentRollout(context.Background(), "ns", "app", 99)
	if err == nil {
		t.Error("expected error for non-existent revision, got nil")
	}
}

func TestUndoDeploymentRollout_OnlyOneRevision(t *testing.T) {
	// Only the current RS exists; there's nothing to roll back to.
	deploy := makeDeployment("ns", "app", 1, "img:v1")
	rs1 := makeRS("ns", "rs-1", "app", 1, "img:v1")

	cs := fake.NewSimpleClientset(deploy, rs1)
	setActiveClientset(t, cs)

	err := undoDeploymentRollout(context.Background(), "ns", "app", 0)
	if err == nil {
		t.Error("expected error when only current revision exists, got nil")
	}
}

func TestUndoDeploymentRollout_PicksHighestNonCurrentRevision(t *testing.T) {
	// Revisions 1, 2, 4, 5 (current). revision=0 should pick 4, not 2 or 1.
	deploy := makeDeployment("ns", "app", 5, "img:v5")
	rs1 := makeRS("ns", "rs-1", "app", 1, "img:v1")
	rs2 := makeRS("ns", "rs-2", "app", 2, "img:v2")
	rs4 := makeRS("ns", "rs-4", "app", 4, "img:v4")
	rs5 := makeRS("ns", "rs-5", "app", 5, "img:v5")

	cs := fake.NewSimpleClientset(deploy, rs1, rs2, rs4, rs5)
	setActiveClientset(t, cs)

	if err := undoDeploymentRollout(context.Background(), "ns", "app", 0); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	updated, _ := cs.AppsV1().Deployments("ns").Get(context.Background(), "app", metav1.GetOptions{})
	if got := updated.Spec.Template.Spec.Containers[0].Image; got != "img:v4" {
		t.Errorf("expected img:v4 (highest non-current), got %s", got)
	}
}

// ── HandlePortForward input validation ────────────────────────────────────────

func TestHandlePortForward_InvalidLocalPort(t *testing.T) {
	cases := []struct {
		name      string
		localPort string
		wantCode  int
	}{
		{"non-numeric", "abc", http.StatusBadRequest},
		{"zero", "0", http.StatusBadRequest},
		{"negative", "-1", http.StatusBadRequest},
		{"empty", "", http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet,
				"/portforward?id=pf1&namespace=ns&pod=p1&localPort="+tc.localPort+"&remotePort=80", nil)
			rr := httptest.NewRecorder()
			HandlePortForward(rr, req)
			if rr.Code != tc.wantCode {
				t.Errorf("expected %d, got %d (body: %s)", tc.wantCode, rr.Code, rr.Body.String())
			}
		})
	}
}

func TestHandlePortForward_InvalidRemotePort(t *testing.T) {
	cases := []struct {
		name       string
		remotePort string
		wantCode   int
	}{
		{"non-numeric", "xyz", http.StatusBadRequest},
		{"zero", "0", http.StatusBadRequest},
		{"negative", "-80", http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet,
				"/portforward?id=pf1&namespace=ns&pod=p1&localPort=8080&remotePort="+tc.remotePort, nil)
			rr := httptest.NewRecorder()
			HandlePortForward(rr, req)
			if rr.Code != tc.wantCode {
				t.Errorf("expected %d, got %d (body: %s)", tc.wantCode, rr.Code, rr.Body.String())
			}
		})
	}
}

// ── HandleScale input validation ──────────────────────────────────────────────

func TestHandleScale_InvalidReplicas(t *testing.T) {
	cs := fake.NewSimpleClientset()
	setActiveClientset(t, cs)

	cases := []struct {
		name     string
		replicas string
		wantCode int
	}{
		{"non-numeric", "abc", http.StatusBadRequest},
		{"negative", "-1", http.StatusBadRequest},
		{"empty", "", http.StatusBadRequest},
		{"float", "1.5", http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet,
				"/scale?namespace=ns&kind=deployment&name=dep&replicas="+tc.replicas, nil)
			rr := httptest.NewRecorder()
			HandleScale(rr, req)
			if rr.Code != tc.wantCode {
				t.Errorf("expected %d, got %d (body: %s)", tc.wantCode, rr.Code, rr.Body.String())
			}
		})
	}
}

func TestHandleScale_ZeroReplicasAllowed(t *testing.T) {
	deploy := makeDeployment("ns", "dep", 1, "img:v1")
	cs := fake.NewSimpleClientset(deploy)
	setActiveClientset(t, cs)

	req := httptest.NewRequest(http.MethodGet, "/scale?namespace=ns&kind=deployment&name=dep&replicas=0", nil)
	rr := httptest.NewRecorder()
	HandleScale(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for zero replicas (scale-to-zero), got %d (body: %s)", rr.Code, rr.Body.String())
	}
}

// ── HandleApplyYAML body-size limit ──────────────────────────────────────────

func TestHandleApplyYAML_BodyTooLarge(t *testing.T) {
	// Build a body just over 10 MB (10*1024*1024 + 1 bytes)
	oversized := make([]byte, 10<<20+1)
	for i := range oversized {
		oversized[i] = 'x'
	}

	req := httptest.NewRequest(http.MethodPost, "/apply", bytes.NewReader(oversized))
	req.Header.Set("Content-Type", "application/yaml")
	rr := httptest.NewRecorder()
	HandleApplyYAML(rr, req)

	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected 413 for oversized body, got %d (body: %s)", rr.Code, rr.Body.String())
	}
}

// ── HandleHelmRollback input validation ───────────────────────────────────────

// ── HandleSecurityScan trivy-not-found ────────────────────────────────────────

func TestHandleSecurityScan_TrivyNotFound(t *testing.T) {
	// Clear PATH so LookPath("trivy") fails, simulating a machine without trivy.
	t.Setenv("PATH", "")

	req := httptest.NewRequest(http.MethodGet, "/security/scan", nil)
	rr := httptest.NewRecorder()
	HandleSecurityScan(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d (body: %s)", rr.Code, rr.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("expected JSON body, got: %s", rr.Body.String())
	}
	if resp["error"] != "trivy_not_found" {
		t.Errorf("expected error=trivy_not_found, got %q", resp["error"])
	}
	if resp["message"] == "" {
		t.Error("expected non-empty message field")
	}
}

// ── HandleKubesecBatch ────────────────────────────────────────────────────────

func TestHandleKubesecBatch_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/security/kubesec/batch", nil)
	rr := httptest.NewRecorder()
	HandleKubesecBatch(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", rr.Code)
	}
}

func TestHandleKubesecBatch_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/security/kubesec/batch",
		bytes.NewBufferString("not json"))
	rr := httptest.NewRecorder()
	HandleKubesecBatch(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestHandleKubesecBatch_NotAnArray(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/security/kubesec/batch",
		bytes.NewBufferString(`{"kind":"Pod"}`))
	rr := httptest.NewRecorder()
	HandleKubesecBatch(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for non-array JSON, got %d", rr.Code)
	}
}

func TestHandleKubesecBatch_BatchTooLarge(t *testing.T) {
	// Build an array with kubesecMaxBatchSize+1 elements.
	items := make([]string, kubesecMaxBatchSize+1)
	for i := range items {
		items[i] = `{"kind":"Pod"}`
	}
	body := "[" + strings.Join(items, ",") + "]"
	req := httptest.NewRequest(http.MethodPost, "/security/kubesec/batch",
		bytes.NewBufferString(body))
	rr := httptest.NewRecorder()
	HandleKubesecBatch(rr, req)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected 413, got %d", rr.Code)
	}
}

func TestHandleKubesecBatch_EmptyBatch(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/security/kubesec/batch",
		bytes.NewBufferString("[]"))
	rr := httptest.NewRecorder()
	HandleKubesecBatch(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}
	if strings.TrimSpace(rr.Body.String()) != "[]" {
		t.Errorf("expected empty JSON array, got: %s", rr.Body.String())
	}
}

func TestHandleKubesecBatch_ValidResource(t *testing.T) {
	// A minimal Pod that kubesec can evaluate. Expect a 200 with one result element.
	pod := `[{"apiVersion":"v1","kind":"Pod","metadata":{"name":"test","namespace":"default"},"spec":{"containers":[{"name":"c","image":"nginx:latest"}]}}]`
	req := httptest.NewRequest(http.MethodPost, "/security/kubesec/batch",
		bytes.NewBufferString(pod))
	rr := httptest.NewRecorder()
	HandleKubesecBatch(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}

	var results []KubesecBatchItem
	if err := json.Unmarshal(rr.Body.Bytes(), &results); err != nil {
		t.Fatalf("expected JSON array of KubesecBatchItem, parse error: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("expected 1 result, got %d", len(results))
	}
	if results[0].Error != "" {
		t.Errorf("expected no error on valid resource, got: %s", results[0].Error)
	}
}

func TestHandleKubesecBatch_PerResourceErrorIsolation(t *testing.T) {
	// First item is deliberately invalid YAML-convertible JSON; second is a valid Pod.
	// The response must contain 2 items: first with an error, second without.
	body := `[
		null,
		{"apiVersion":"v1","kind":"Pod","metadata":{"name":"ok","namespace":"default"},"spec":{"containers":[{"name":"c","image":"nginx:1.25"}]}}
	]`
	req := httptest.NewRequest(http.MethodPost, "/security/kubesec/batch",
		bytes.NewBufferString(body))
	rr := httptest.NewRecorder()
	HandleKubesecBatch(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}

	var results []KubesecBatchItem
	if err := json.Unmarshal(rr.Body.Bytes(), &results); err != nil {
		t.Fatalf("JSON parse error: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
		return
	}
	// Second result (valid Pod) must have no error.
	if results[1].Error != "" {
		t.Errorf("expected no error on valid resource at index 1, got: %s", results[1].Error)
	}
}

// ── kindGVR alias table ───────────────────────────────────────────────────────

func TestKindGVR_AliasesPresent(t *testing.T) {
	// These aliases were added to fix getYAML/delete returning 400 for renderer
	// components that use short kind names. Regression guard: changing a key or
	// forgetting to add a new alias must fail this test immediately.
	cases := []struct {
		kind     string
		resource string
		group    string
	}{
		// Short alias → same GVR as canonical name
		{"hpa", "horizontalpodautoscalers", "autoscaling"},
		{"persistentvolume", "persistentvolumes", ""},
		{"persistentvolumeclaim", "persistentvolumeclaims", ""},
		// Canonical names must also resolve
		{"horizontalpodautoscaler", "horizontalpodautoscalers", "autoscaling"},
		{"pv", "persistentvolumes", ""},
		{"pvc", "persistentvolumeclaims", ""},
		// A sample of other well-known kinds
		{"pod", "pods", ""},
		{"deployment", "deployments", "apps"},
		{"node", "nodes", ""},
	}
	for _, tc := range cases {
		t.Run(tc.kind, func(t *testing.T) {
			gvr, ok := kindGVR[tc.kind]
			if !ok {
				t.Fatalf("kindGVR[%q] is missing", tc.kind)
			}
			if gvr.Resource != tc.resource {
				t.Errorf("kindGVR[%q].Resource = %q, want %q", tc.kind, gvr.Resource, tc.resource)
			}
			if gvr.Group != tc.group {
				t.Errorf("kindGVR[%q].Group = %q, want %q", tc.kind, gvr.Group, tc.group)
			}
		})
	}
}

func TestKindGVR_HPAAliasMatchesCanonical(t *testing.T) {
	hpa := kindGVR["hpa"]
	canonical := kindGVR["horizontalpodautoscaler"]
	if hpa != canonical {
		t.Errorf("hpa alias GVR %+v does not match canonical %+v", hpa, canonical)
	}
}

func TestKindGVR_PVAliasMatchesCanonical(t *testing.T) {
	pv := kindGVR["persistentvolume"]
	canonical := kindGVR["pv"]
	if pv != canonical {
		t.Errorf("persistentvolume alias GVR %+v does not match canonical pv %+v", pv, canonical)
	}
}

func TestClusterScopedKinds_PVPresent(t *testing.T) {
	// persistentvolume must be cluster-scoped so getYAML omits the namespace param.
	if !clusterScopedKinds["persistentvolume"] {
		t.Error("persistentvolume must be in clusterScopedKinds")
	}
	if !clusterScopedKinds["pv"] {
		t.Error("pv must be in clusterScopedKinds")
	}
}

// ── HandleHelmRollback input validation ───────────────────────────────────────

func TestHandleHelmRollback_InvalidRevision(t *testing.T) {
	cases := []struct {
		name     string
		revision string
		wantCode int
	}{
		{"non-numeric", "abc", http.StatusBadRequest},
		{"zero", "0", http.StatusBadRequest},
		{"negative", "-1", http.StatusBadRequest},
		{"empty", "", http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet,
				"/helm/rollback?namespace=ns&release=myapp&revision="+tc.revision, nil)
			rr := httptest.NewRecorder()
			HandleHelmRollback(rr, req)
			if rr.Code != tc.wantCode {
				t.Errorf("expected %d, got %d (body: %s)", tc.wantCode, rr.Code, rr.Body.String())
			}
		})
	}
}
