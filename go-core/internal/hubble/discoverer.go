package hubble

import (
	"context"
	"fmt"
	"time"

	"github.com/podscape/go-core/internal/graph"
)

const FlowWindow = 60 * time.Second

// FlowGetter is the interface for retrieving observed flows.
// Implemented by *Manager in production and stub types in tests.
type FlowGetter interface {
	GetFlows(ctx context.Context, namespace string, window time.Duration) ([]Flow, error)
}

// HubbleDiscoverer implements graph.Discoverer and emits hubble-flow edges
// for pod pairs observed communicating in the last flowWindow.
type HubbleDiscoverer struct {
	getter     FlowGetter
	flowWindow time.Duration
	namespace  string // empty string fetches flows across all namespaces
}

func NewDiscoverer(getter FlowGetter, flowWindow time.Duration, namespace string) *HubbleDiscoverer {
	return &HubbleDiscoverer{getter: getter, flowWindow: flowWindow, namespace: namespace}
}

func (d *HubbleDiscoverer) Name() string { return "HubbleDiscoverer" }

func (d *HubbleDiscoverer) Discover(_ context.Context, nodes []graph.Node, _ graph.ResourceCache) []graph.Edge {
	if d.getter == nil {
		return nil
	}

	// Build lookup: "namespace/podName" -> node.ID for all pod nodes.
	podIndex := make(map[string]string, len(nodes))
	for _, n := range nodes {
		if n.Kind == graph.KindPod {
			podIndex[n.Namespace+"/"+n.Name] = n.ID
		}
	}
	if len(podIndex) == 0 {
		return nil
	}

	// Use context.Background() rather than parent (the HTTP request context) so
	// that a client disconnect or navigation-away does not cancel the in-flight
	// flow fetch and incorrectly trigger the 2-minute negative cache.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	flows, err := d.getter.GetFlows(ctx, d.namespace, d.flowWindow)
	if err != nil || len(flows) == 0 {
		return nil
	}

	type edgeKey struct{ src, dst string }
	type edgeMeta struct{ dropped bool }
	seen := make(map[edgeKey]edgeMeta)

	for _, f := range flows {
		srcID, srcOK := podIndex[f.SrcNamespace+"/"+f.SrcPod]
		dstID, dstOK := podIndex[f.DstNamespace+"/"+f.DstPod]
		if !srcOK || !dstOK || srcID == dstID {
			continue
		}
		k := edgeKey{srcID, dstID}
		existing := seen[k]
		// DROPPED and ERROR both indicate a traffic problem; DROPPED takes
		// priority but ERROR is also surfaced rather than silently counted as
		// forwarded traffic.
		if f.Verdict == "DROPPED" || f.Verdict == "ERROR" {
			existing.dropped = true
		}
		seen[k] = existing
	}

	edges := make([]graph.Edge, 0, len(seen))
	for k, m := range seen {
		label := ""
		if m.dropped {
			label = "dropped"
		}
		edges = append(edges, graph.Edge{
			ID:     fmt.Sprintf("hubble:%s->%s", k.src, k.dst),
			Source: k.src,
			Target: k.dst,
			Kind:   graph.EdgeHubbleFlow,
			Label:  label,
		})
	}
	return edges
}
