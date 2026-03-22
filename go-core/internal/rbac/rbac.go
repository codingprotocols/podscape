package rbac

import (
	"context"
	"log"
	"sync"

	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ResourceDescriptor describes a Kubernetes resource type for RBAC probing.
type ResourceDescriptor struct {
	// Resource is the lowercase plural name (e.g. "pods", "deployments").
	Resource string
	// Group is the API group; "" for core resources.
	Group string
}

// AllResources is the complete ordered list of resources the sidecar watches.
// It is the single source of truth consulted by CheckAccess and the informer
// registration guards in informers.go. Add new resource types here first.
var AllResources = []ResourceDescriptor{
	// Critical — needed for the dashboard on first load
	{Resource: "nodes", Group: ""},
	{Resource: "namespaces", Group: ""},
	{Resource: "pods", Group: ""},
	{Resource: "deployments", Group: "apps"},
	{Resource: "events", Group: ""},
	// Workloads
	{Resource: "daemonsets", Group: "apps"},
	{Resource: "statefulsets", Group: "apps"},
	{Resource: "replicasets", Group: "apps"},
	{Resource: "jobs", Group: "batch"},
	{Resource: "cronjobs", Group: "batch"},
	{Resource: "horizontalpodautoscalers", Group: "autoscaling"},
	{Resource: "poddisruptionbudgets", Group: "policy"},
	// Networking
	{Resource: "services", Group: ""},
	{Resource: "ingresses", Group: "networking.k8s.io"},
	{Resource: "ingressclasses", Group: "networking.k8s.io"},
	{Resource: "networkpolicies", Group: "networking.k8s.io"},
	{Resource: "endpoints", Group: ""},
	// Config & Storage
	{Resource: "configmaps", Group: ""},
	{Resource: "secrets", Group: ""},
	{Resource: "persistentvolumeclaims", Group: ""},
	{Resource: "persistentvolumes", Group: ""},
	{Resource: "storageclasses", Group: "storage.k8s.io"},
	// RBAC
	{Resource: "serviceaccounts", Group: ""},
	{Resource: "roles", Group: "rbac.authorization.k8s.io"},
	{Resource: "clusterroles", Group: "rbac.authorization.k8s.io"},
	{Resource: "rolebindings", Group: "rbac.authorization.k8s.io"},
	{Resource: "clusterrolebindings", Group: "rbac.authorization.k8s.io"},
	// CRDs (uses a separate apiextensions client but the SAR check uses the
	// main clientset — the SAR endpoint can evaluate any API group)
	{Resource: "customresourcedefinitions", Group: "apiextensions.k8s.io"},
}

// CheckAccessFunc is the function invoked to probe RBAC permissions. It is a
// variable so tests can substitute a stub without a live Kubernetes cluster.
var CheckAccessFunc = CheckAccess

// CheckAccess runs a SelfSubjectAccessReview for every resource in AllResources,
// checking both the "list" and "watch" verbs. A resource is considered allowed
// only when both verbs are permitted.
//
// All SAR requests are issued concurrently (bounded to 8 goroutines) to keep
// the probe fast; 28 resources × 2 verbs = 56 requests typically completes
// in well under one second on a healthy cluster.
//
// Three possible return states:
//   - (map, nil)  — probe succeeded; check map[resource] for individual access.
//   - (nil, err)  — the SAR API itself is unavailable; callers should fall back
//     to the pre-RBAC behaviour (start all informers unconditionally).
//   - map with false values — specific resources are denied.
func CheckAccess(ctx context.Context, cs kubernetes.Interface) (map[string]bool, error) {
	type sarResult struct {
		resource string
		allowed  bool
		err      error
	}

	results := make([]sarResult, 0, len(AllResources)*2)
	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		sem     = make(chan struct{}, 8)
		firstErr error
	)

	// Initialise all resources as allowed; individual goroutines mark false.
	allowed := make(map[string]bool, len(AllResources))
	for _, rd := range AllResources {
		allowed[rd.Resource] = true
	}

	for _, rd := range AllResources {
		for _, verb := range [2]string{"list", "watch"} {
			rd, verb := rd, verb
			wg.Add(1)
			go func() {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				review := &authv1.SelfSubjectAccessReview{
					Spec: authv1.SelfSubjectAccessReviewSpec{
						ResourceAttributes: &authv1.ResourceAttributes{
							Verb:     verb,
							Resource: rd.Resource,
							Group:    rd.Group,
						},
					},
				}
				resp, err := cs.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})

				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					if firstErr == nil {
						firstErr = err
					}
					return
				}
				results = append(results, sarResult{resource: rd.Resource, allowed: resp.Status.Allowed})
			}()
		}
	}

	wg.Wait()

	if firstErr != nil {
		return nil, firstErr
	}

	for _, r := range results {
		if !r.allowed {
			allowed[r.resource] = false
		}
	}

	denied := 0
	for _, ok := range allowed {
		if !ok {
			denied++
		}
	}
	if denied > 0 {
		log.Printf("[RBAC] probe complete: %d/%d resources denied", denied, len(AllResources))
	}

	return allowed, nil
}
