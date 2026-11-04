package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/audit"
	"github.com/podscape/go-core/internal/store"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

// setupAuditForTest points audit.Global at a fresh temp file for the
// duration of one test and restores the previous value afterward, so tests
// never share audit-log state.
func setupAuditForTest(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "audit.log")
	w, err := audit.Open(path)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	orig := audit.Global
	audit.Global = w
	t.Cleanup(func() { audit.Global = orig })
	return path
}

func readAuditEvents(t *testing.T, path string) []audit.Event {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatalf("ReadFile: %v", err)
	}
	var events []audit.Event
	for _, line := range bytes.Split(bytes.TrimSpace(data), []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		var ev audit.Event
		if err := json.Unmarshal(line, &ev); err != nil {
			t.Fatalf("unmarshal audit line: %v", err)
		}
		events = append(events, ev)
	}
	return events
}

func TestHandleScale_RecordsAuditEventOnSuccess(t *testing.T) {
	auditPath := setupAuditForTest(t)

	rep := int32(2)
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "default"},
		Spec:       appsv1.DeploymentSpec{Replicas: &rep},
	}
	fakeClientset := fake.NewSimpleClientset(deploy)
	ac := newTestCache(fakeClientset)
	origCache, origKubeconfig := store.Store.ActiveCache, store.Store.Kubeconfig
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	resetStore(t, origCache, origKubeconfig)

	req := httptest.NewRequest(http.MethodPost, "/scale?namespace=default&kind=deployment&name=api&replicas=5", nil)
	rr := httptest.NewRecorder()
	HandleScale(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	ev := events[0]
	if ev.Action != "scale" {
		t.Errorf("expected action %q, got %q", "scale", ev.Action)
	}
	if ev.ResourceKind != "Deployment" || ev.ResourceName != "api" || ev.Namespace != "default" {
		t.Errorf("unexpected resource fields: kind=%q name=%q ns=%q", ev.ResourceKind, ev.ResourceName, ev.Namespace)
	}
	if ev.Outcome != "success" {
		t.Errorf("expected outcome %q, got %q", "success", ev.Outcome)
	}
	if ev.Params["replicas_from"] != float64(2) || ev.Params["replicas_to"] != float64(5) {
		t.Errorf("unexpected params: %+v", ev.Params)
	}
}

func TestHandleScale_RecordsAuditEventOnFailure(t *testing.T) {
	auditPath := setupAuditForTest(t)

	fakeClientset := fake.NewSimpleClientset() // no deployment named "missing" exists
	ac := newTestCache(fakeClientset)
	origCache, origKubeconfig := store.Store.ActiveCache, store.Store.Kubeconfig
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	resetStore(t, origCache, origKubeconfig)

	req := httptest.NewRequest(http.MethodPost, "/scale?namespace=default&kind=deployment&name=missing&replicas=5", nil)
	rr := httptest.NewRecorder()
	HandleScale(rr, req)

	if rr.Code == http.StatusOK {
		t.Fatalf("expected a non-200 response for a missing deployment, got 200")
	}

	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Outcome != "failure" {
		t.Errorf("expected outcome %q, got %q", "failure", events[0].Outcome)
	}
	if events[0].Error == "" {
		t.Error("expected a non-empty error message on failure")
	}
}

func TestHandleDelete_RecordsAuditEventOnFailure(t *testing.T) {
	// HandleDelete builds its own dynamic client directly from cfg
	// (dynamic.NewForConfig), rather than using the injectable fake
	// clientset — so, like HandleCPFrom/HandleCPTo, it can only be
	// exercised on the failure path without a live cluster. That's still
	// enough to prove the audit call fires with the right shape.
	auditPath := setupAuditForTest(t)

	fakeClientset := fake.NewSimpleClientset()
	ac := newTestCache(fakeClientset)
	origCache, origKubeconfig := store.Store.ActiveCache, store.Store.Kubeconfig
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	resetStore(t, origCache, origKubeconfig)

	req := httptest.NewRequest(http.MethodPost, "/delete?namespace=default&kind=pod&name=web-1", nil)
	rr := httptest.NewRecorder()
	HandleDelete(rr, req)

	if rr.Code == http.StatusOK {
		t.Fatalf("expected a non-200 response with no real cluster, got 200")
	}

	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	ev := events[0]
	if ev.Action != "delete" || ev.ResourceKind != "Pod" || ev.ResourceName != "web-1" || ev.Namespace != "default" {
		t.Errorf("unexpected event: %+v", ev)
	}
	if ev.Outcome != "failure" {
		t.Errorf("expected outcome %q, got %q", "failure", ev.Outcome)
	}
	if ev.Error == "" {
		t.Error("expected a non-empty error message on failure")
	}
}

// newFakeDiscoveryServer starts an httptest.Server that answers the minimal
// Kubernetes discovery (/api, /apis, /api/v1) and PATCH-any-resource surface
// HandleApplyYAML's real discovery/dynamic clients need, since (unlike most
// handlers) it builds those clients directly from cfg rather than going
// through the injectable fake clientset. Returns the server, closed via
// t.Cleanup.
func newFakeDiscoveryServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(metav1.APIVersions{Versions: []string{"v1"}})
	})
	mux.HandleFunc("/api/v1", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(metav1.APIResourceList{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "configmaps", Namespaced: true, Kind: "ConfigMap"},
			},
		})
	})
	mux.HandleFunc("/apis", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(metav1.APIGroupList{})
	})
	mux.HandleFunc("/api/v1/namespaces/default/configmaps/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"applied"}}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestHandleApplyYAML_RecordsOneEventPerDocument(t *testing.T) {
	auditPath := setupAuditForTest(t)

	srv := newFakeDiscoveryServer(t)
	fakeClientset := fake.NewSimpleClientset()
	ac := newTestCache(fakeClientset)
	ac.Config = &rest.Config{Host: srv.URL}
	origCache, origKubeconfig := store.Store.ActiveCache, store.Store.Kubeconfig
	store.Store.Lock()
	store.Store.ActiveCache = ac
	store.Store.Unlock()
	resetStore(t, origCache, origKubeconfig)

	// Two documents in one multi-doc apply — must produce two audit events,
	// each with its own checksum, not one event for the whole submission.
	multiDoc := `apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-a
  namespace: default
data:
  key: value
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-b
  namespace: default
data:
  key: value2
`
	req := httptest.NewRequest(http.MethodPost, "/apply", strings.NewReader(multiDoc))
	rr := httptest.NewRecorder()
	HandleApplyYAML(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	events := readAuditEvents(t, auditPath)
	if len(events) != 2 {
		t.Fatalf("expected 2 audit events (one per document), got %d", len(events))
	}
	for _, ev := range events {
		if ev.Action != "apply_yaml" {
			t.Errorf("expected action %q, got %q", "apply_yaml", ev.Action)
		}
		if ev.ResourceKind != "ConfigMap" {
			t.Errorf("expected resource_kind %q, got %q", "ConfigMap", ev.ResourceKind)
		}
		if ev.Namespace != "default" {
			t.Errorf("expected namespace %q, got %q", "default", ev.Namespace)
		}
		checksum, ok := ev.Params["checksum_sha256"].(string)
		if !ok || len(checksum) != 64 {
			t.Errorf("expected a 64-char hex checksum in params, got %+v", ev.Params)
		}
		if ev.Outcome != "success" {
			t.Errorf("expected outcome %q, got %q", "success", ev.Outcome)
		}
	}
	if events[0].ResourceName == events[1].ResourceName {
		t.Errorf("expected distinct resource names for cm-a and cm-b, got both %q", events[0].ResourceName)
	}

	// The raw manifest content must never appear in the audit log.
	raw, err := os.ReadFile(auditPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if strings.Contains(string(raw), "key: value") {
		t.Error("audit log must not contain the applied YAML body content")
	}
}

func TestHandleRolloutRestart_RecordsAuditEvent(t *testing.T) {
	auditPath := setupAuditForTest(t)

	deploy := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "default"}}
	fakeClientset := fake.NewSimpleClientset(deploy)
	setActiveClientset(t, fakeClientset)

	req := httptest.NewRequest(http.MethodPost, "/rollout/restart?namespace=default&kind=deployment&name=api", nil)
	rr := httptest.NewRecorder()
	HandleRolloutRestart(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "rollout_restart" || events[0].ResourceKind != "Deployment" || events[0].ResourceName != "api" {
		t.Errorf("unexpected event: %+v", events[0])
	}
}

func TestHandleRolloutUndo_RecordsAuditEventWithTargetRevision(t *testing.T) {
	auditPath := setupAuditForTest(t)

	deploy := makeDeployment("default", "api", 2, "img:v2")
	rs1 := makeRS("default", "api-1", "api", 1, "img:v1")
	rs2 := makeRS("default", "api-2", "api", 2, "img:v2")
	fakeClientset := fake.NewSimpleClientset(deploy, rs1, rs2)
	setActiveClientset(t, fakeClientset)

	req := httptest.NewRequest(http.MethodPost, "/rollout/undo?namespace=default&kind=deployment&name=api", nil)
	rr := httptest.NewRecorder()
	HandleRolloutUndo(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "rollout_undo" || events[0].ResourceKind != "Deployment" || events[0].ResourceName != "api" {
		t.Errorf("unexpected event: %+v", events[0])
	}
	if _, ok := events[0].Params["target_revision"]; !ok {
		t.Errorf("expected params to contain target_revision, got %+v", events[0].Params)
	}
}

func TestHandleCordonNode_RecordsAuditEvent(t *testing.T) {
	auditPath := setupAuditForTest(t)

	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}}
	fakeClientset := fake.NewSimpleClientset(node)
	setActiveClientset(t, fakeClientset)

	req := httptest.NewRequest(http.MethodPost, "/node/cordon?name=node-1", nil)
	rr := httptest.NewRecorder()
	HandleCordonNode(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "cordon_node" || events[0].ResourceKind != "Node" || events[0].ResourceName != "node-1" {
		t.Errorf("unexpected event: %+v", events[0])
	}
	if events[0].Params["unschedulable"] != true {
		t.Errorf("expected params.unschedulable=true, got %+v", events[0].Params)
	}
}

func TestHandleDrainNode_RecordsAuditEventWithEvictionCounts(t *testing.T) {
	auditPath := setupAuditForTest(t)

	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}}
	evictablePod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "web-1", Namespace: "default"},
		Spec:       corev1.PodSpec{NodeName: "node-1"},
	}
	daemonsetPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "ds-1", Namespace: "default",
			OwnerReferences: []metav1.OwnerReference{{Kind: "DaemonSet", Name: "fluentd"}},
		},
		Spec: corev1.PodSpec{NodeName: "node-1"},
	}
	fakeClientset := fake.NewSimpleClientset(node, evictablePod, daemonsetPod)
	setActiveClientset(t, fakeClientset)

	req := httptest.NewRequest(http.MethodPost, "/node/drain?name=node-1", nil)
	rr := httptest.NewRecorder()
	HandleDrainNode(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "drain_node" || events[0].ResourceKind != "Node" || events[0].ResourceName != "node-1" {
		t.Errorf("unexpected event: %+v", events[0])
	}
	if events[0].Params["pods_evicted"] != float64(1) {
		t.Errorf("expected params.pods_evicted=1, got %+v", events[0].Params)
	}
	if events[0].Params["pods_skipped"] != float64(1) {
		t.Errorf("expected params.pods_skipped=1 (the DaemonSet pod), got %+v", events[0].Params)
	}
}

func TestHandleTriggerCronJob_RecordsAuditEventWithCreatedJobName(t *testing.T) {
	auditPath := setupAuditForTest(t)

	cj := &batchv1.CronJob{ObjectMeta: metav1.ObjectMeta{Name: "nightly", Namespace: "default"}}
	fakeClientset := fake.NewSimpleClientset(cj)
	setActiveClientset(t, fakeClientset)

	req := httptest.NewRequest(http.MethodPost, "/cronjob/trigger?namespace=default&name=nightly", nil)
	rr := httptest.NewRecorder()
	HandleTriggerCronJob(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "trigger_cronjob" || events[0].ResourceKind != "CronJob" || events[0].ResourceName != "nightly" {
		t.Errorf("unexpected event: %+v", events[0])
	}
	createdJobName, ok := events[0].Params["created_job_name"].(string)
	if !ok || !strings.HasPrefix(createdJobName, "nightly-manual-") {
		t.Errorf("expected params.created_job_name to start with %q, got %+v", "nightly-manual-", events[0].Params)
	}
}

func TestHandleCreateDebugPod_RecordsAuditEvent(t *testing.T) {
	auditPath := setupAuditForTest(t)

	fakeClientset := fake.NewSimpleClientset()
	setActiveClientset(t, fakeClientset)

	req := httptest.NewRequest(http.MethodPost, "/debugpod/create?namespace=default&image=busybox:1.36&name=debug-1", nil)
	rr := httptest.NewRecorder()
	HandleCreateDebugPod(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "create_debug_pod" || events[0].ResourceKind != "Pod" || events[0].ResourceName != "debug-1" {
		t.Errorf("unexpected event: %+v", events[0])
	}
	if events[0].Params["image"] != "busybox:1.36" {
		t.Errorf("expected params.image %q, got %+v", "busybox:1.36", events[0].Params)
	}
}

// newRealClientsetForFailureTest builds a real *kubernetes.Clientset (not
// the fake one) pointed at an empty rest.Config. Handlers that call
// exec.Exec route through clientset.CoreV1().RESTClient() directly, which
// panics on a fake clientset (its RESTClient is unconfigured) rather than
// returning a connection error — a real clientset against an unreachable
// host fails cleanly instead, which is what these failure-path tests need.
func newRealClientsetForFailureTest(t *testing.T) *kubernetes.Clientset {
	t.Helper()
	cs, err := kubernetes.NewForConfig(&rest.Config{})
	if err != nil {
		t.Fatalf("kubernetes.NewForConfig: %v", err)
	}
	return cs
}

func TestHandleCPFrom_RecordsAuditEventOnFailure(t *testing.T) {
	auditPath := setupAuditForTest(t)

	setActiveClientset(t, newRealClientsetForFailureTest(t))

	req := httptest.NewRequest(http.MethodGet, "/cp/from?namespace=default&pod=web-1&container=app&path=/tmp/file.txt", nil)
	rr := httptest.NewRecorder()
	HandleCPFrom(rr, req)

	// No real cluster to exec against — expect the pre-flight check to fail,
	// which is enough to prove the audit call fires on the failure path.
	if rr.Code == http.StatusOK {
		t.Fatalf("expected a non-200 response with no real cluster, got 200")
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "cp_from" || events[0].ResourceKind != "Pod" || events[0].ResourceName != "web-1" {
		t.Errorf("unexpected event: %+v", events[0])
	}
	if events[0].Params["remote_path"] != "/tmp/file.txt" || events[0].Params["container"] != "app" {
		t.Errorf("unexpected params: %+v", events[0].Params)
	}
	if events[0].Outcome != "failure" {
		t.Errorf("expected outcome %q, got %q", "failure", events[0].Outcome)
	}
}

func TestHandleExec_RecordsStartAndEndAuditEvents(t *testing.T) {
	auditPath := setupAuditForTest(t)

	setActiveClientset(t, newRealClientsetForFailureTest(t))

	srv := httptest.NewServer(http.HandlerFunc(HandleExec))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/exec?namespace=default&pod=web-1&container=app"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	// No real cluster to exec into, so the session fails immediately —
	// enough to prove both exec_start and exec_end are recorded. Read until
	// the server closes the connection (exec.Exec returning an error).
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
	conn.Close()

	// The server-side handler runs to completion asynchronously relative to
	// the client's read loop ending — poll briefly for the second event.
	deadline := time.Now().Add(2 * time.Second)
	var events []audit.Event
	for time.Now().Before(deadline) {
		events = readAuditEvents(t, auditPath)
		if len(events) >= 2 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	if len(events) != 2 {
		t.Fatalf("expected 2 audit events (exec_start, exec_end), got %d: %+v", len(events), events)
	}
	if events[0].Action != "exec_start" || events[0].ResourceKind != "Pod" || events[0].ResourceName != "web-1" {
		t.Errorf("unexpected first event: %+v", events[0])
	}
	if events[0].Params["container"] != "app" {
		t.Errorf("expected params.container %q, got %+v", "app", events[0].Params)
	}
	if events[1].Action != "exec_end" || events[1].ResourceKind != "Pod" || events[1].ResourceName != "web-1" {
		t.Errorf("unexpected second event: %+v", events[1])
	}
	if events[1].Outcome != "failure" {
		t.Errorf("expected exec_end outcome %q with no real cluster, got %q", "failure", events[1].Outcome)
	}
}

func TestHandleCPTo_RecordsAuditEventOnFailure(t *testing.T) {
	auditPath := setupAuditForTest(t)

	setActiveClientset(t, newRealClientsetForFailureTest(t))

	localFile := filepath.Join(t.TempDir(), "upload.txt")
	if err := os.WriteFile(localFile, []byte("hello"), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/cp/to?namespace=default&pod=web-1&container=app&path=/tmp/file.txt&localPath="+localFile, nil)
	rr := httptest.NewRecorder()
	HandleCPTo(rr, req)

	if rr.Code == http.StatusOK {
		t.Fatalf("expected a non-200 response with no real cluster, got 200")
	}
	events := readAuditEvents(t, auditPath)
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Action != "cp_to" || events[0].ResourceKind != "Pod" || events[0].ResourceName != "web-1" {
		t.Errorf("unexpected event: %+v", events[0])
	}
	if events[0].Params["remote_path"] != "/tmp/file.txt" || events[0].Params["container"] != "app" {
		t.Errorf("unexpected params: %+v", events[0].Params)
	}
	if events[0].Outcome != "failure" {
		t.Errorf("expected outcome %q, got %q", "failure", events[0].Outcome)
	}
}
