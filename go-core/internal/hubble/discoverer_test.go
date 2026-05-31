package hubble_test

import (
	"context"
	"testing"
	"time"

	"github.com/podscape/go-core/internal/graph"
	"github.com/podscape/go-core/internal/hubble"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubGetter struct {
	flows []hubble.Flow
}

func (s *stubGetter) GetFlows(_ context.Context, _ string, _ time.Duration) ([]hubble.Flow, error) {
	return s.flows, nil
}

func TestHubbleDiscoverer_EmitsEdgeForObservedFlow(t *testing.T) {
	stub := &stubGetter{flows: []hubble.Flow{
		{SrcNamespace: "default", SrcPod: "frontend-abc", DstNamespace: "default", DstPod: "backend-xyz", Verdict: "FORWARDED"},
	}}
	d := hubble.NewDiscoverer(stub, hubble.FlowWindow)
	nodes := []graph.Node{
		{ID: "pod:uid-frontend", Kind: graph.KindPod, Name: "frontend-abc", Namespace: "default"},
		{ID: "pod:uid-backend", Kind: graph.KindPod, Name: "backend-xyz", Namespace: "default"},
	}
	edges := d.Discover(nodes, nil)
	require.Len(t, edges, 1)
	assert.Equal(t, graph.EdgeHubbleFlow, edges[0].Kind)
	assert.Equal(t, "pod:uid-frontend", edges[0].Source)
	assert.Equal(t, "pod:uid-backend", edges[0].Target)
}

func TestHubbleDiscoverer_SkipsFlowsForUnknownNodes(t *testing.T) {
	stub := &stubGetter{flows: []hubble.Flow{
		{SrcNamespace: "default", SrcPod: "ghost-pod", DstNamespace: "default", DstPod: "backend-xyz", Verdict: "FORWARDED"},
	}}
	d := hubble.NewDiscoverer(stub, hubble.FlowWindow)
	nodes := []graph.Node{
		{ID: "pod:uid-backend", Kind: graph.KindPod, Name: "backend-xyz", Namespace: "default"},
	}
	edges := d.Discover(nodes, nil)
	assert.Empty(t, edges)
}

func TestHubbleDiscoverer_DeduplicatesParallelFlows(t *testing.T) {
	stub := &stubGetter{flows: []hubble.Flow{
		{SrcNamespace: "default", SrcPod: "frontend-abc", DstNamespace: "default", DstPod: "backend-xyz", Verdict: "FORWARDED"},
		{SrcNamespace: "default", SrcPod: "frontend-abc", DstNamespace: "default", DstPod: "backend-xyz", Verdict: "FORWARDED"},
		{SrcNamespace: "default", SrcPod: "frontend-abc", DstNamespace: "default", DstPod: "backend-xyz", Verdict: "FORWARDED"},
	}}
	d := hubble.NewDiscoverer(stub, hubble.FlowWindow)
	nodes := []graph.Node{
		{ID: "pod:uid-frontend", Kind: graph.KindPod, Name: "frontend-abc", Namespace: "default"},
		{ID: "pod:uid-backend", Kind: graph.KindPod, Name: "backend-xyz", Namespace: "default"},
	}
	edges := d.Discover(nodes, nil)
	assert.Len(t, edges, 1)
}

func TestHubbleDiscoverer_DroppedFlowGetsDroppedLabel(t *testing.T) {
	stub := &stubGetter{flows: []hubble.Flow{
		{SrcNamespace: "default", SrcPod: "frontend-abc", DstNamespace: "default", DstPod: "backend-xyz", Verdict: "DROPPED"},
	}}
	d := hubble.NewDiscoverer(stub, hubble.FlowWindow)
	nodes := []graph.Node{
		{ID: "pod:uid-frontend", Kind: graph.KindPod, Name: "frontend-abc", Namespace: "default"},
		{ID: "pod:uid-backend", Kind: graph.KindPod, Name: "backend-xyz", Namespace: "default"},
	}
	edges := d.Discover(nodes, nil)
	require.Len(t, edges, 1)
	assert.Equal(t, "dropped", edges[0].Label)
}

func TestHubbleDiscoverer_ErrorFlowGetsDroppedLabel(t *testing.T) {
	stub := &stubGetter{flows: []hubble.Flow{
		{SrcNamespace: "default", SrcPod: "frontend-abc", DstNamespace: "default", DstPod: "backend-xyz", Verdict: "ERROR"},
	}}
	d := hubble.NewDiscoverer(stub, hubble.FlowWindow)
	nodes := []graph.Node{
		{ID: "pod:uid-frontend", Kind: graph.KindPod, Name: "frontend-abc", Namespace: "default"},
		{ID: "pod:uid-backend", Kind: graph.KindPod, Name: "backend-xyz", Namespace: "default"},
	}
	edges := d.Discover(nodes, nil)
	require.Len(t, edges, 1)
	assert.Equal(t, "dropped", edges[0].Label)
}
