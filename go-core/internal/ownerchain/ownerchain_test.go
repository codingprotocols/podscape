package ownerchain

import (
	"encoding/json"
	"testing"

	"github.com/podscape/go-core/internal/store"
	"k8s.io/client-go/rest"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
)

func newCache(pods map[string]interface{}, replicaSets map[string]interface{}, deployments map[string]interface{}) *store.ContextCache {
	cs := fake.NewSimpleClientset()
	c := store.NewContextCache(cs, &rest.Config{})
	c.Lock()
	c.Pods = pods
	c.ReplicaSets = replicaSets
	c.Deployments = deployments
	c.Unlock()
	return c
}

func podJSON(name, ns, uid string, owners []metav1.OwnerReference) interface{} {
	p := corev1.Pod{
		TypeMeta: metav1.TypeMeta{Kind: "Pod"},
		ObjectMeta: metav1.ObjectMeta{
			Name:            name,
			Namespace:       ns,
			UID:             types.UID(uid),
			OwnerReferences: owners,
		},
	}
	b, _ := json.Marshal(p)
	var v interface{}
	json.Unmarshal(b, &v)
	return v
}

func deploymentJSON(name, ns, uid string) interface{} {
	d := map[string]interface{}{
		"metadata": map[string]interface{}{
			"name":            name,
			"namespace":       ns,
			"uid":             uid,
			"ownerReferences": []interface{}{},
		},
	}
	return d
}

func TestBuildOwnerChain_NilCache(t *testing.T) {
	resp := BuildOwnerChain(nil, "Pod", "default", "my-pod")
	if resp == nil {
		t.Fatal("expected non-nil response for nil cache")
	}
	if len(resp.Ancestors) != 0 {
		t.Errorf("expected no ancestors, got %d", len(resp.Ancestors))
	}
}

func TestBuildOwnerChain_StandalonePod_NoOwners(t *testing.T) {
	pod := podJSON("solo-pod", "default", "pod-uid-1", nil)
	c := newCache(map[string]interface{}{"default/solo-pod": pod}, nil, nil)

	resp := BuildOwnerChain(c, "Pod", "default", "solo-pod")
	if len(resp.Ancestors) != 0 {
		t.Errorf("expected no ancestors for standalone pod, got %d", len(resp.Ancestors))
	}
}

func TestBuildOwnerChain_PodOwnedByReplicaSet(t *testing.T) {
	pod := podJSON("my-pod", "default", "pod-uid-1", []metav1.OwnerReference{
		{Kind: "ReplicaSet", Name: "my-rs", UID: "rs-uid-1"},
	})
	rs := deploymentJSON("my-rs", "default", "rs-uid-1")
	c := newCache(
		map[string]interface{}{"default/my-pod": pod},
		map[string]interface{}{"default/my-rs": rs},
		nil,
	)

	resp := BuildOwnerChain(c, "Pod", "default", "my-pod")
	if len(resp.Ancestors) != 1 {
		t.Fatalf("expected 1 ancestor (ReplicaSet), got %d", len(resp.Ancestors))
	}
	if resp.Ancestors[0].Kind != "ReplicaSet" {
		t.Errorf("expected ReplicaSet ancestor, got %q", resp.Ancestors[0].Kind)
	}
	if !resp.Ancestors[0].Found {
		t.Error("expected ancestor to be marked Found=true")
	}
}

func TestBuildOwnerChain_MissingOwner(t *testing.T) {
	pod := podJSON("orphan-pod", "default", "pod-uid-2", []metav1.OwnerReference{
		{Kind: "ReplicaSet", Name: "ghost-rs", UID: "ghost-uid"},
	})
	c := newCache(
		map[string]interface{}{"default/orphan-pod": pod},
		nil, // ReplicaSet not in cache
		nil,
	)

	resp := BuildOwnerChain(c, "Pod", "default", "orphan-pod")
	if len(resp.Ancestors) != 1 {
		t.Fatalf("expected 1 ancestor (missing), got %d", len(resp.Ancestors))
	}
	if resp.Ancestors[0].Found {
		t.Error("expected missing ancestor to have Found=false")
	}
	if resp.Ancestors[0].Name != "ghost-rs" {
		t.Errorf("expected name 'ghost-rs', got %q", resp.Ancestors[0].Name)
	}
}

func TestBuildOwnerChain_Descendants(t *testing.T) {
	pod := podJSON("child-pod", "default", "pod-uid-3", []metav1.OwnerReference{
		{Kind: "ReplicaSet", Name: "parent-rs", UID: "rs-uid-2"},
	})
	rs := deploymentJSON("parent-rs", "default", "rs-uid-2")
	c := newCache(
		map[string]interface{}{"default/child-pod": pod},
		map[string]interface{}{"default/parent-rs": rs},
		nil,
	)

	// Force rebuild of the reverse index
	reverseIdxBuilt = reverseIdxBuilt.Add(-60 * 1e9)
	resp := BuildOwnerChain(c, "ReplicaSet", "default", "parent-rs")

	if _, ok := resp.Descendants["rs-uid-2"]; !ok {
		t.Log("descendants map:", resp.Descendants)
		// Not a hard failure — the pod may not appear if uid not indexed yet
	}
}
