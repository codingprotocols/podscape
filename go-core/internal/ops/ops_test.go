package ops

import (
	"context"
	"testing"

	"github.com/podscape/go-core/internal/client"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
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
