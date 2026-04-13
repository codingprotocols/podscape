package graph

import (
	"fmt"
	"log"
	"sync"
)

// GraphBuilder orchestrates the discovery of resources and relationships.
type GraphBuilder struct {
	cache       ResourceCache
	discoverers []Discoverer
	mu          sync.Mutex
}

// NewGraphBuilder creates a new instance of the discovery engine.
func NewGraphBuilder(cache ResourceCache) *GraphBuilder {
	return &GraphBuilder{
		discoverers: []Discoverer{
			&OwnerDiscoverer{},
			&SelectorDiscoverer{},
			&VolumeDiscoverer{},
			&NodeDiscoverer{},
			&ConnectionDiscoverer{},
			&NetworkPolicyDiscoverer{},
		},
		cache: cache,
	}
}

// AddDiscoverer allows registering custom relationship discovery logic.
func (b *GraphBuilder) AddDiscoverer(d Discoverer) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.discoverers = append(b.discoverers, d)
}

// Build constructs the full graph from the provided set of starting nodes.
func (b *GraphBuilder) Build(initialNodes []Node) *Graph {
	b.mu.Lock()
	discoverers := make([]Discoverer, len(b.discoverers))
	copy(discoverers, b.discoverers)
	b.mu.Unlock()

	graph := &Graph{
		Nodes:      initialNodes,
		Edges:      []Edge{},
		Namespaces: []string{},
	}

	edgeMap := make(map[string]bool)
	nsMap := make(map[string]bool)

	// Collect unique namespaces
	for _, n := range graph.Nodes {
		if n.Namespace != "" && !nsMap[n.Namespace] {
			nsMap[n.Namespace] = true
			graph.Namespaces = append(graph.Namespaces, n.Namespace)
		}
	}

	// Run all registered discoverers
	for _, d := range discoverers {
		log.Printf("[GraphBuilder] Running %s...", d.Name())
		newEdges := d.Discover(graph.Nodes, b.cache)
		
		for _, e := range newEdges {
			if !edgeMap[e.ID] {
				graph.Edges = append(graph.Edges, e)
				edgeMap[e.ID] = true
			}
		}
	}

	b.collapseResources(graph)

	return graph
}

func (b *GraphBuilder) collapseResources(graph *Graph) {
	groups := make(map[string][]int) // key -> indices in graph.Nodes
	for i, n := range graph.Nodes {
		if (n.Kind == KindPod || n.Kind == KindReplicaSet) && n.OwnerUID != "" {
			key := fmt.Sprintf("%s:%s:%s", n.Kind, n.Namespace, n.OwnerUID)
			groups[key] = append(groups[key], i)
		}
	}

	idMap := make(map[string]string)
	newNodes := make([]Node, 0, len(graph.Nodes))
	removedIndices := make(map[int]bool)

	for _, indices := range groups {
		if len(indices) <= 1 {
			continue
		}

		// Create collapsed node
		base := graph.Nodes[indices[0]]
		collapsedID := fmt.Sprintf("collapsed:%s:%s", base.Kind, base.OwnerUID)
		
		names := make([]string, 0, len(indices))
		for _, idx := range indices {
			n := graph.Nodes[idx]
			names = append(names, n.Name)
			idMap[n.ID] = collapsedID
			removedIndices[idx] = true
		}

		collapsedNode := base
		collapsedNode.ID = collapsedID
		collapsedNode.ReplicaCount = len(indices)
		collapsedNode.ReplicaNames = names
		// Shorten name if it ends with a hash/suffix, usually owners share a prefix
		if len(collapsedNode.Name) > 10 {
			collapsedNode.Name = collapsedNode.Name[:len(collapsedNode.Name)-6] + ".."
		}

		newNodes = append(newNodes, collapsedNode)
	}

	// Add non-collapsed nodes
	for i, n := range graph.Nodes {
		if !removedIndices[i] {
			newNodes = append(newNodes, n)
		}
	}
	graph.Nodes = newNodes

	// Update edges
	if len(idMap) > 0 {
		newEdges := make([]Edge, 0, len(graph.Edges))
		edgeSeen := make(map[string]bool)
		for _, e := range graph.Edges {
			if newSrc, ok := idMap[e.Source]; ok {
				e.Source = newSrc
			}
			if newTarget, ok := idMap[e.Target]; ok {
				e.Target = newTarget
			}
			// Update edge ID to reflect new endpoints
			e.ID = fmt.Sprintf("edge:%s:%s:%s", e.Source, e.Target, e.Kind)
			if !edgeSeen[e.ID] {
				newEdges = append(newEdges, e)
				edgeSeen[e.ID] = true
			}
		}
		graph.Edges = newEdges
	}
}

// BuildFiltered constructs a graph focused on a specific namespace.
func (b *GraphBuilder) BuildFiltered(nodes []Node, ns string) *Graph {
	filteredNodes := make([]Node, 0)
	for _, n := range nodes {
		if ns == "" || n.Namespace == ns || n.Namespace == "" {
			filteredNodes = append(filteredNodes, n)
		}
	}
	return b.Build(filteredNodes)
}
