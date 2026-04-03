package ops

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/podscape/go-core/internal/client"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/types"
	ktypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

// fakeBundle builds a *client.ClientBundle backed by a fake clientset.
// Config is a zero-value REST config — only used when dynClientFactory is also faked.
func fakeBundle(objects ...runtime.Object) *client.ClientBundle {
	return &client.ClientBundle{
		Clientset:   fake.NewSimpleClientset(objects...),
		Config:      &rest.Config{Host: "http://fake"},
		ContextName: "test-context",
	}
}

// injectDynClient replaces the package-level dynClientFactory with one that
// returns the given fake dynamic client, and restores the original on cleanup.
func injectDynClient(t *testing.T, dyn dynamic.Interface) {
	t.Helper()
	orig := dynClientFactory
	dynClientFactory = func(*rest.Config) (dynamic.Interface, error) { return dyn, nil }
	t.Cleanup(func() { dynClientFactory = orig })
}

// injectFakeMapper replaces the package-level restMapperFactory with one that
// maps a single GVK to its resource without hitting the API server.
func injectFakeMapper(t *testing.T, gvk schema.GroupVersionKind, gvr schema.GroupVersionResource, namespaced bool) {
	t.Helper()
	orig := restMapperFactory
	restMapperFactory = func(*rest.Config) (meta.RESTMapper, error) {
		rm := meta.NewDefaultRESTMapper([]schema.GroupVersion{gvk.GroupVersion()})
		scope := meta.RESTScopeNameNamespace
		if !namespaced {
			scope = meta.RESTScopeNameRoot
		}
		rm.Add(gvk, &fakeRESTScope{name: scope})
		return rm, nil
	}
	t.Cleanup(func() { restMapperFactory = orig })
}

type fakeRESTScope struct{ name meta.RESTScopeName }

func (s *fakeRESTScope) Name() meta.RESTScopeName { return s.name }

func int32p(v int32) *int32 { return &v }

// ── Scale ─────────────────────────────────────────────────────────────────────

func TestScale_Deployment(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default"},
		Spec:       appsv1.DeploymentSpec{Replicas: int32p(1)},
	}
	bundle := fakeBundle(deploy)

	if err := Scale(context.Background(), bundle, "default", "deployment", "web", 3); err != nil {
		t.Fatalf("Scale: %v", err)
	}

	got, err := bundle.Clientset.AppsV1().Deployments("default").Get(context.Background(), "web", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if *got.Spec.Replicas != 3 {
		t.Errorf("expected replicas=3, got %d", *got.Spec.Replicas)
	}
}

func TestScale_StatefulSet(t *testing.T) {
	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: "db", Namespace: "prod"},
		Spec:       appsv1.StatefulSetSpec{Replicas: int32p(1)},
	}
	bundle := fakeBundle(sts)

	if err := Scale(context.Background(), bundle, "prod", "sts", "db", 5); err != nil {
		t.Fatalf("Scale: %v", err)
	}

	got, err := bundle.Clientset.AppsV1().StatefulSets("prod").Get(context.Background(), "db", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if *got.Spec.Replicas != 5 {
		t.Errorf("expected replicas=5, got %d", *got.Spec.Replicas)
	}
}

func TestScale_UnsupportedKind(t *testing.T) {
	bundle := fakeBundle()
	err := Scale(context.Background(), bundle, "default", "daemonset", "fluentd", 3)
	if err == nil {
		t.Fatal("expected error for unsupported kind, got nil")
	}
}

// ── Delete ────────────────────────────────────────────────────────────────────

func TestDelete_UnsupportedKind(t *testing.T) {
	bundle := fakeBundle()
	err := Delete(context.Background(), bundle, "default", "unknownkind", "foo")
	if err == nil {
		t.Fatal("expected error for unsupported kind")
	}
}

func TestDelete_NamespacedResource(t *testing.T) {
	scheme := runtime.NewScheme()
	corev1.AddToScheme(scheme)

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "mypod", Namespace: "default"},
	}
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	dynFake := dynamicfake.NewSimpleDynamicClient(scheme, pod)
	bundle := fakeBundle(pod)
	injectDynClient(t, dynFake)

	if err := Delete(context.Background(), bundle, "default", "pod", "mypod"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	list, _ := dynFake.Resource(gvr).Namespace("default").List(context.Background(), metav1.ListOptions{})
	if len(list.Items) != 0 {
		t.Errorf("expected pod to be deleted, still found %d items", len(list.Items))
	}
}

func TestDelete_ClusterScopedResource(t *testing.T) {
	scheme := runtime.NewScheme()
	corev1.AddToScheme(scheme)

	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "staging"}}
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}
	dynFake := dynamicfake.NewSimpleDynamicClient(scheme, ns)
	bundle := fakeBundle(ns)
	injectDynClient(t, dynFake)

	if err := Delete(context.Background(), bundle, "", "namespace", "staging"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	list, _ := dynFake.Resource(gvr).List(context.Background(), metav1.ListOptions{})
	if len(list.Items) != 0 {
		t.Errorf("expected namespace to be deleted, still found %d items", len(list.Items))
	}
}

// ── RolloutRestart ────────────────────────────────────────────────────────────

func TestRolloutRestart_Deployment(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "default"},
	}
	bundle := fakeBundle(deploy)

	if err := RolloutRestart(context.Background(), bundle, "default", "deployment", "api"); err != nil {
		t.Fatalf("RolloutRestart: %v", err)
	}

	got, _ := bundle.Clientset.AppsV1().Deployments("default").Get(context.Background(), "api", metav1.GetOptions{})
	ann := got.Spec.Template.Annotations
	if ann == nil || ann["kubectl.kubernetes.io/restartedAt"] == "" {
		t.Error("expected restartedAt annotation to be set")
	}
}

func TestRolloutRestart_DaemonSet(t *testing.T) {
	ds := &appsv1.DaemonSet{
		ObjectMeta: metav1.ObjectMeta{Name: "fluentd", Namespace: "kube-system"},
	}
	bundle := fakeBundle(ds)

	if err := RolloutRestart(context.Background(), bundle, "kube-system", "ds", "fluentd"); err != nil {
		t.Fatalf("RolloutRestart: %v", err)
	}

	got, _ := bundle.Clientset.AppsV1().DaemonSets("kube-system").Get(context.Background(), "fluentd", metav1.GetOptions{})
	if got.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] == "" {
		t.Error("expected restartedAt annotation to be set on daemonset")
	}
}

func TestRolloutRestart_UnsupportedKind(t *testing.T) {
	bundle := fakeBundle()
	err := RolloutRestart(context.Background(), bundle, "default", "job", "myjob")
	if err == nil {
		t.Fatal("expected error for unsupported kind")
	}
}

// ── RolloutUndo ───────────────────────────────────────────────────────────────

func makeRS(name, ns string, revision string, ownerUID types.UID) *appsv1.ReplicaSet {
	return &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			// Labels must match the deployment selector so the fake client returns
			// this RS when listing with LabelSelector: "app=web".
			Labels: map[string]string{"app": "web"},
			Annotations: map[string]string{
				"deployment.kubernetes.io/revision": revision,
			},
			OwnerReferences: []metav1.OwnerReference{
				{UID: ownerUID, Controller: func() *bool { b := true; return &b }()},
			},
		},
		Spec: appsv1.ReplicaSetSpec{
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"rev": revision}},
			},
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "web"},
			},
		},
	}
}

func TestRolloutUndo_ToPreviousRevision(t *testing.T) {
	uid := types.UID("deploy-uid")
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default", UID: uid},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
		},
	}
	rs1 := makeRS("web-rs-1", "default", "1", uid)
	rs2 := makeRS("web-rs-2", "default", "2", uid)
	bundle := fakeBundle(deploy, rs1, rs2)

	if err := RolloutUndo(context.Background(), bundle, "default", "deployment", "web", 0); err != nil {
		t.Fatalf("RolloutUndo: %v", err)
	}
	// Verify the deployment was patched (fake client records actions).
	actions := bundle.Clientset.(*fake.Clientset).Actions()
	patchFound := false
	for _, a := range actions {
		if a.GetVerb() == "patch" && a.GetResource().Resource == "deployments" {
			patchFound = true
		}
	}
	if !patchFound {
		t.Error("expected a patch action on deployments")
	}
}

func TestRolloutUndo_NoPreviousRevision(t *testing.T) {
	uid := types.UID("deploy-uid")
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default", UID: uid},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
		},
	}
	rs1 := makeRS("web-rs-1", "default", "1", uid)
	bundle := fakeBundle(deploy, rs1)

	err := RolloutUndo(context.Background(), bundle, "default", "deployment", "web", 0)
	if err == nil {
		t.Fatal("expected error when no previous revision exists")
	}
}

func TestRolloutUndo_UnsupportedKind(t *testing.T) {
	bundle := fakeBundle()
	err := RolloutUndo(context.Background(), bundle, "default", "statefulset", "db", 0)
	if err == nil {
		t.Fatal("expected error for unsupported kind")
	}
}

// ── ListResource / GetResource ─────────────────────────────────────────────────

func TestListResource_AllTypes(t *testing.T) {
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"}}
	deploy := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "d1", Namespace: "default"}}
	svc := &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "s1", Namespace: "default"}}
	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "n1"}}
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "ns1"}}
	cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "cm1", Namespace: "default"}}
	sec := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "sec1", Namespace: "default"}}
	sts := &appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "sts1", Namespace: "default"}}
	ds := &appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds1", Namespace: "default"}}
	bundle := fakeBundle(pod, deploy, svc, node, ns, cm, sec, sts, ds)
	ctx := context.Background()

	cases := []struct {
		resource string
		ns       string
	}{
		{"pods", "default"}, {"pod", "default"},
		{"deployments", "default"}, {"deployment", "default"},
		{"services", "default"}, {"service", "default"},
		{"nodes", ""}, {"node", ""},
		{"namespaces", ""}, {"namespace", ""},
		{"configmaps", "default"}, {"configmap", "default"},
		{"secrets", "default"}, {"secret", "default"},
		{"statefulsets", "default"}, {"statefulset", "default"},
		{"daemonsets", "default"}, {"daemonset", "default"},
	}

	for _, tc := range cases {
		t.Run(tc.resource, func(t *testing.T) {
			result, err := ListResource(ctx, bundle, tc.resource, tc.ns)
			if err != nil {
				t.Fatalf("ListResource(%q): %v", tc.resource, err)
			}
			if result == nil {
				t.Errorf("ListResource(%q): got nil result", tc.resource)
			}
		})
	}
}

func TestListResource_UnsupportedType(t *testing.T) {
	bundle := fakeBundle()
	_, err := ListResource(context.Background(), bundle, "widgets", "default")
	if err == nil {
		t.Fatal("expected error for unsupported resource type")
	}
}

func TestGetResource_AllTypes(t *testing.T) {
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"}}
	deploy := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "d1", Namespace: "default"}}
	svc := &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "s1", Namespace: "default"}}
	node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "n1"}}
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "ns1"}}
	cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "cm1", Namespace: "default"}}
	sec := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "sec1", Namespace: "default"}}
	sts := &appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "sts1", Namespace: "default"}}
	ds := &appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds1", Namespace: "default"}}
	bundle := fakeBundle(pod, deploy, svc, node, ns, cm, sec, sts, ds)
	ctx := context.Background()

	cases := []struct {
		resource, name, ns string
	}{
		{"pod", "p1", "default"},
		{"deployment", "d1", "default"},
		{"service", "s1", "default"},
		{"node", "n1", ""},
		{"namespace", "ns1", ""},
		{"configmap", "cm1", "default"},
		{"secret", "sec1", "default"},
		{"statefulset", "sts1", "default"},
		{"daemonset", "ds1", "default"},
	}

	for _, tc := range cases {
		t.Run(tc.resource, func(t *testing.T) {
			result, err := GetResource(ctx, bundle, tc.resource, tc.name, tc.ns)
			if err != nil {
				t.Fatalf("GetResource(%q, %q): %v", tc.resource, tc.name, err)
			}
			if result == nil {
				t.Errorf("GetResource(%q): got nil result", tc.resource)
			}
		})
	}
}

func TestGetResource_UnsupportedType(t *testing.T) {
	bundle := fakeBundle()
	_, err := GetResource(context.Background(), bundle, "widgets", "foo", "default")
	if err == nil {
		t.Fatal("expected error for unsupported resource type")
	}
}

// ── ParseRevision ─────────────────────────────────────────────────────────────

func TestParseRevision(t *testing.T) {
	cases := []struct {
		name    string
		ann     map[string]string
		wantRev int64
		wantOk  bool
	}{
		{"present", map[string]string{"deployment.kubernetes.io/revision": "5"}, 5, true},
		{"zero_revision", map[string]string{"deployment.kubernetes.io/revision": "0"}, 0, true},
		{"missing_key", map[string]string{}, 0, false},
		{"nil_map", nil, 0, false},
		{"empty_value", map[string]string{"deployment.kubernetes.io/revision": ""}, 0, false},
		{"non_numeric", map[string]string{"deployment.kubernetes.io/revision": "abc"}, 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rev, ok := ParseRevision(tc.ann)
			if ok != tc.wantOk {
				t.Errorf("ok=%v, want %v", ok, tc.wantOk)
			}
			if ok && rev != tc.wantRev {
				t.Errorf("rev=%d, want %d", rev, tc.wantRev)
			}
		})
	}
}

// ── ApplyYAML ─────────────────────────────────────────────────────────────────

func TestApplyYAML_InvalidYAML(t *testing.T) {
	bundle := fakeBundle()
	err := ApplyYAML(context.Background(), bundle, []byte("{{invalid"))
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
	if !strings.Contains(err.Error(), "invalid YAML") {
		t.Errorf("expected 'invalid YAML' in error, got: %v", err)
	}
}

func TestApplyYAML_StripsServerManagedFields(t *testing.T) {
	// Verify that managedFields, status, uid, resourceVersion,
	// creationTimestamp, and generation are stripped before the patch is built.
	scheme := runtime.NewScheme()
	corev1.AddToScheme(scheme)

	var capturedPayload []byte
	dynFake := dynamicfake.NewSimpleDynamicClient(scheme)

	origDyn := dynClientFactory
	dynClientFactory = func(*rest.Config) (dynamic.Interface, error) {
		return &capturingDynClient{inner: dynFake, capture: &capturedPayload}, nil
	}
	t.Cleanup(func() { dynClientFactory = origDyn })

	// Inject a fake mapper so no real API server needed.
	injectFakeMapper(t,
		schema.GroupVersionKind{Group: "", Version: "v1", Kind: "ConfigMap"},
		schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"},
		true,
	)

	yamlStr := `
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-cm
  namespace: default
  uid: "some-uid"
  resourceVersion: "12345"
  creationTimestamp: "2024-01-01T00:00:00Z"
  generation: 3
  managedFields:
    - manager: kubectl
status:
  phase: Running
data:
  key: value
`
	bundle := fakeBundle()
	_ = ApplyYAML(context.Background(), bundle, []byte(yamlStr))

	if capturedPayload == nil {
		t.Fatal("expected patch to be called — captured payload is nil")
	}
	var obj map[string]interface{}
	if err := json.Unmarshal(capturedPayload, &obj); err != nil {
		t.Fatalf("captured payload is not JSON: %v", err)
	}
	if _, ok := obj["status"]; ok {
		t.Error("status should be stripped from patch payload")
	}
	objMeta, _ := obj["metadata"].(map[string]interface{})
	if objMeta == nil {
		t.Fatal("metadata missing from patch payload")
	}
	for _, field := range []string{"uid", "resourceVersion", "creationTimestamp", "generation", "managedFields"} {
		if _, present := objMeta[field]; present {
			t.Errorf("metadata.%s should be stripped from patch payload", field)
		}
	}
}

func TestApplyYAML_ImmutablePodError(t *testing.T) {
	// Verify the friendly error message is returned for immutable pod spec errors.
	origDyn := dynClientFactory
	dynClientFactory = func(*rest.Config) (dynamic.Interface, error) {
		return &immutableErrorDynClient{}, nil
	}
	t.Cleanup(func() { dynClientFactory = origDyn })

	injectFakeMapper(t,
		schema.GroupVersionKind{Group: "", Version: "v1", Kind: "Pod"},
		schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"},
		true,
	)

	yamlStr := `
apiVersion: v1
kind: Pod
metadata:
  name: mypod
  namespace: default
spec:
  containers:
    - name: app
      image: nginx
`
	bundle := fakeBundle()
	err := ApplyYAML(context.Background(), bundle, []byte(yamlStr))
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "immutable") {
		t.Errorf("expected friendly immutable message, got: %v", err)
	}
}

// ── test helpers ──────────────────────────────────────────────────────────────

// capturingDynClient wraps a dynamic client and records the first Patch payload.
type capturingDynClient struct {
	inner   dynamic.Interface
	capture *[]byte
}

func (c *capturingDynClient) Resource(resource schema.GroupVersionResource) dynamic.NamespaceableResourceInterface {
	return &capturingResourceClient{inner: c.inner.Resource(resource), capture: c.capture}
}

type capturingResourceClient struct {
	inner   dynamic.NamespaceableResourceInterface
	capture *[]byte
}

func (r *capturingResourceClient) Namespace(ns string) dynamic.ResourceInterface {
	return &capturingNsResourceClient{inner: r.inner.Namespace(ns), capture: r.capture}
}
func (r *capturingResourceClient) Apply(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions, subresources ...string) (*unstructured.Unstructured, error) {
	return r.inner.Apply(ctx, name, obj, opts, subresources...)
}
func (r *capturingResourceClient) ApplyStatus(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions) (*unstructured.Unstructured, error) {
	return r.inner.ApplyStatus(ctx, name, obj, opts)
}
func (r *capturingResourceClient) Create(ctx context.Context, obj *unstructured.Unstructured, opts metav1.CreateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return r.inner.Create(ctx, obj, opts, sub...)
}
func (r *capturingResourceClient) Update(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return r.inner.Update(ctx, obj, opts, sub...)
}
func (r *capturingResourceClient) UpdateStatus(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions) (*unstructured.Unstructured, error) {
	return r.inner.UpdateStatus(ctx, obj, opts)
}
func (r *capturingResourceClient) Delete(ctx context.Context, name string, opts metav1.DeleteOptions, sub ...string) error {
	return r.inner.Delete(ctx, name, opts, sub...)
}
func (r *capturingResourceClient) DeleteCollection(ctx context.Context, opts metav1.DeleteOptions, listOpts metav1.ListOptions) error {
	return r.inner.DeleteCollection(ctx, opts, listOpts)
}
func (r *capturingResourceClient) Get(ctx context.Context, name string, opts metav1.GetOptions, sub ...string) (*unstructured.Unstructured, error) {
	return r.inner.Get(ctx, name, opts, sub...)
}
func (r *capturingResourceClient) List(ctx context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error) {
	return r.inner.List(ctx, opts)
}
func (r *capturingResourceClient) Watch(ctx context.Context, opts metav1.ListOptions) (watch.Interface, error) {
	return r.inner.Watch(ctx, opts)
}
func (r *capturingResourceClient) Patch(ctx context.Context, name string, pt ktypes.PatchType, data []byte, opts metav1.PatchOptions, sub ...string) (*unstructured.Unstructured, error) {
	*r.capture = data
	return r.inner.Patch(ctx, name, pt, data, opts, sub...)
}

type capturingNsResourceClient struct {
	inner   dynamic.ResourceInterface
	capture *[]byte
}

func (r *capturingNsResourceClient) Apply(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions, subresources ...string) (*unstructured.Unstructured, error) {
	return r.inner.Apply(ctx, name, obj, opts, subresources...)
}
func (r *capturingNsResourceClient) ApplyStatus(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions) (*unstructured.Unstructured, error) {
	return r.inner.ApplyStatus(ctx, name, obj, opts)
}
func (r *capturingNsResourceClient) Create(ctx context.Context, obj *unstructured.Unstructured, opts metav1.CreateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return r.inner.Create(ctx, obj, opts, sub...)
}
func (r *capturingNsResourceClient) Update(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return r.inner.Update(ctx, obj, opts, sub...)
}
func (r *capturingNsResourceClient) UpdateStatus(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions) (*unstructured.Unstructured, error) {
	return r.inner.UpdateStatus(ctx, obj, opts)
}
func (r *capturingNsResourceClient) Delete(ctx context.Context, name string, opts metav1.DeleteOptions, sub ...string) error {
	return r.inner.Delete(ctx, name, opts, sub...)
}
func (r *capturingNsResourceClient) DeleteCollection(ctx context.Context, opts metav1.DeleteOptions, listOpts metav1.ListOptions) error {
	return r.inner.DeleteCollection(ctx, opts, listOpts)
}
func (r *capturingNsResourceClient) Get(ctx context.Context, name string, opts metav1.GetOptions, sub ...string) (*unstructured.Unstructured, error) {
	return r.inner.Get(ctx, name, opts, sub...)
}
func (r *capturingNsResourceClient) List(ctx context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error) {
	return r.inner.List(ctx, opts)
}
func (r *capturingNsResourceClient) Watch(ctx context.Context, opts metav1.ListOptions) (watch.Interface, error) {
	return r.inner.Watch(ctx, opts)
}
func (r *capturingNsResourceClient) Patch(ctx context.Context, name string, pt ktypes.PatchType, data []byte, opts metav1.PatchOptions, sub ...string) (*unstructured.Unstructured, error) {
	*r.capture = data
	return nil, fmt.Errorf("fake patch")
}

// immutableErrorDynClient returns a "pod updates may not change fields" error on Patch.
type immutableErrorDynClient struct{}

func (c *immutableErrorDynClient) Resource(resource schema.GroupVersionResource) dynamic.NamespaceableResourceInterface {
	return &immutableNsResourceClient{}
}

type immutableNsResourceClient struct{}

func (r *immutableNsResourceClient) Namespace(ns string) dynamic.ResourceInterface {
	return &immutableResourceClient{}
}
func (r *immutableNsResourceClient) Apply(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) ApplyStatus(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) Create(ctx context.Context, obj *unstructured.Unstructured, opts metav1.CreateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) Update(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) UpdateStatus(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) Delete(ctx context.Context, name string, opts metav1.DeleteOptions, sub ...string) error {
	return nil
}
func (r *immutableNsResourceClient) DeleteCollection(ctx context.Context, opts metav1.DeleteOptions, listOpts metav1.ListOptions) error {
	return nil
}
func (r *immutableNsResourceClient) Get(ctx context.Context, name string, opts metav1.GetOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) List(ctx context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) Watch(ctx context.Context, opts metav1.ListOptions) (watch.Interface, error) {
	return nil, nil
}
func (r *immutableNsResourceClient) Patch(ctx context.Context, name string, pt ktypes.PatchType, data []byte, opts metav1.PatchOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, fmt.Errorf("pod updates may not change fields other than spec.containers[*].image")
}

type immutableResourceClient struct{}

func (r *immutableResourceClient) Apply(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableResourceClient) ApplyStatus(ctx context.Context, name string, obj *unstructured.Unstructured, opts metav1.ApplyOptions) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableResourceClient) Create(ctx context.Context, obj *unstructured.Unstructured, opts metav1.CreateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableResourceClient) Update(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableResourceClient) UpdateStatus(ctx context.Context, obj *unstructured.Unstructured, opts metav1.UpdateOptions) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableResourceClient) Delete(ctx context.Context, name string, opts metav1.DeleteOptions, sub ...string) error {
	return nil
}
func (r *immutableResourceClient) DeleteCollection(ctx context.Context, opts metav1.DeleteOptions, listOpts metav1.ListOptions) error {
	return nil
}
func (r *immutableResourceClient) Get(ctx context.Context, name string, opts metav1.GetOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, nil
}
func (r *immutableResourceClient) List(ctx context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error) {
	return nil, nil
}
func (r *immutableResourceClient) Watch(ctx context.Context, opts metav1.ListOptions) (watch.Interface, error) {
	return nil, nil
}
func (r *immutableResourceClient) Patch(ctx context.Context, name string, pt ktypes.PatchType, data []byte, opts metav1.PatchOptions, sub ...string) (*unstructured.Unstructured, error) {
	return nil, fmt.Errorf("pod updates may not change fields other than spec.containers[*].image")
}
