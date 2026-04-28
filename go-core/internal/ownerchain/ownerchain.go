package ownerchain

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/podscape/go-core/internal/store"
)

// OwnerRef describes a single node in the owner chain.
type OwnerRef struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	UID       string `json:"uid"`
	Found     bool   `json:"found"`
}

// OwnerChainResponse is returned by BuildOwnerChain.
type OwnerChainResponse struct {
	// Ancestors is ordered nearest-first (direct owner first, then its owner, etc.)
	Ancestors []OwnerRef `json:"ancestors"`
	// Descendants maps owner UID → direct children
	Descendants map[string][]OwnerRef `json:"descendants"`
}

// k8sObjectMeta is the minimal metadata we need from any resource.
type k8sObjectMeta struct {
	Metadata struct {
		Name            string `json:"name"`
		Namespace       string `json:"namespace"`
		UID             string `json:"uid"`
		OwnerReferences []struct {
			APIVersion string `json:"apiVersion"`
			Kind       string `json:"kind"`
			Name       string `json:"name"`
			UID        string `json:"uid"`
		} `json:"ownerReferences"`
	} `json:"metadata"`
}

// reverseIndex maps owner UID → direct children
var (
	reverseIdx      map[string][]OwnerRef
	reverseIdxBuilt time.Time
	reverseIdxCache *store.ContextCache // which cache the index was built from
	reverseIdxMu    sync.RWMutex
)

// getReverseIndex returns (or rebuilds) the owner→children index.
// Rebuilt at most once every 30s.
func getReverseIndex(c *store.ContextCache) map[string][]OwnerRef {
	reverseIdxMu.RLock()
	if reverseIdxCache == c && time.Since(reverseIdxBuilt) < 30*time.Second {
		idx := reverseIdx
		reverseIdxMu.RUnlock()
		return idx
	}
	reverseIdxMu.RUnlock()

	reverseIdxMu.Lock()
	defer reverseIdxMu.Unlock()
	// Double-check after acquiring write lock
	if reverseIdxCache == c && time.Since(reverseIdxBuilt) < 30*time.Second {
		return reverseIdx
	}

	idx := make(map[string][]OwnerRef)

	type itemWithKind struct {
		v    interface{}
		kind string
	}

	// Snapshot all resource values under the read lock so we can iterate
	// safely after releasing it. Holding the lock for the full iteration
	// would block informer writes; a value-level snapshot avoids that
	// without introducing a data race.
	c.RLock()
	var items []itemWithKind
	for kind, m := range map[string]map[string]interface{}{
		"Pod":         c.Pods,
		"ReplicaSet":  c.ReplicaSets,
		"Deployment":  c.Deployments,
		"DaemonSet":   c.DaemonSets,
		"StatefulSet": c.StatefulSets,
		"Job":         c.Jobs,
		"CronJob":     c.CronJobs,
	} {
		for _, v := range m {
			items = append(items, itemWithKind{v: v, kind: kind})
		}
	}
	c.RUnlock()

	for _, entry := range items {
		raw, err := json.Marshal(entry.v)
		if err != nil {
			continue
		}
		var obj k8sObjectMeta
		if err := json.Unmarshal(raw, &obj); err != nil {
			continue
		}
		for _, owner := range obj.Metadata.OwnerReferences {
			child := OwnerRef{
				Kind:      entry.kind,
				Name:      obj.Metadata.Name,
				Namespace: obj.Metadata.Namespace,
				UID:       obj.Metadata.UID,
				Found:     true,
			}
			idx[owner.UID] = append(idx[owner.UID], child)
		}
	}

	reverseIdx = idx
	reverseIdxBuilt = time.Now()
	reverseIdxCache = c
	return idx
}

// lookupResource finds a resource in the cache by kind/namespace/name.
// Returns marshaled JSON bytes, or nil if not found.
func lookupResource(c *store.ContextCache, kind, namespace, name string) []byte {
	key := namespace + "/" + name
	if namespace == "" {
		key = name
	}

	c.RLock()
	defer c.RUnlock()

	var v interface{}
	var ok bool
	switch kind {
	case "Pod":
		v, ok = c.Pods[key]
	case "ReplicaSet":
		v, ok = c.ReplicaSets[key]
	case "Deployment":
		v, ok = c.Deployments[key]
	case "DaemonSet":
		v, ok = c.DaemonSets[key]
	case "StatefulSet":
		v, ok = c.StatefulSets[key]
	case "Job":
		v, ok = c.Jobs[key]
	case "CronJob":
		v, ok = c.CronJobs[key]
	default:
		return nil
	}
	if !ok {
		return nil
	}
	raw, _ := json.Marshal(v)
	return raw
}

// walkUp traverses the ownership chain upward from kind/namespace/name.
// Returns ancestors in order from nearest to furthest.
func walkUp(c *store.ContextCache, kind, namespace, name string, seen map[string]bool, depth int) []OwnerRef {
	if depth > 10 {
		return nil
	}

	raw := lookupResource(c, kind, namespace, name)
	if raw == nil {
		// Resource not found — return a placeholder so the UI shows it as missing
		return []OwnerRef{{Kind: kind, Name: name, Namespace: namespace, Found: false}}
	}

	var obj k8sObjectMeta
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}

	uid := obj.Metadata.UID
	if seen[uid] {
		return nil // cycle detected
	}
	seen[uid] = true

	if len(obj.Metadata.OwnerReferences) == 0 {
		return nil // reached the root
	}

	var result []OwnerRef
	for _, ownerRef := range obj.Metadata.OwnerReferences {
		ns := namespace
		if ns == "" {
			ns = obj.Metadata.Namespace
		}

		ownerNode := OwnerRef{
			Kind:      ownerRef.Kind,
			Name:      ownerRef.Name,
			Namespace: ns,
			UID:       ownerRef.UID,
			Found:     false,
		}

		// Check if owner exists in cache
		ownerRaw := lookupResource(c, ownerRef.Kind, ns, ownerRef.Name)
		if ownerRaw != nil {
			ownerNode.Found = true
			var ownerObj k8sObjectMeta
			if json.Unmarshal(ownerRaw, &ownerObj) == nil {
				ownerNode.UID = ownerObj.Metadata.UID
			}
		}

		result = append(result, ownerNode)

		// Recurse upward if owner was found
		if ownerNode.Found {
			ancestors := walkUp(c, ownerRef.Kind, ns, ownerRef.Name, seen, depth+1)
			result = append(result, ancestors...)
		}
	}
	return result
}

// BuildOwnerChain returns the full owner chain (ancestors + descendants) for a resource.
func BuildOwnerChain(c *store.ContextCache, kind, namespace, name string) *OwnerChainResponse {
	if c == nil {
		return &OwnerChainResponse{Ancestors: []OwnerRef{}, Descendants: map[string][]OwnerRef{}}
	}

	seen := make(map[string]bool)
	ancestors := walkUp(c, kind, namespace, name, seen, 0)
	if ancestors == nil {
		ancestors = []OwnerRef{}
	}

	// Find the UID of the requested resource for the descendants lookup
	raw := lookupResource(c, kind, namespace, name)
	var uid string
	if raw != nil {
		var obj k8sObjectMeta
		if json.Unmarshal(raw, &obj) == nil {
			uid = obj.Metadata.UID
		}
	}

	descendants := make(map[string][]OwnerRef)
	if uid != "" {
		reverseIndex := getReverseIndex(c)
		if children, ok := reverseIndex[uid]; ok {
			descendants[uid] = children
			// One level deeper (grandchildren)
			for _, child := range children {
				if grandchildren, ok := reverseIndex[child.UID]; ok {
					descendants[child.UID] = grandchildren
				}
			}
		}
	}

	return &OwnerChainResponse{
		Ancestors:   ancestors,
		Descendants: descendants,
	}
}
