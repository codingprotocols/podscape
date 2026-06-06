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
	// ClusterScoped indicates that this resource is not namespaced. When false,
	// SAR checks are issued for both "" (cluster-wide grants via ClusterRoleBindings)
	// and "default" (namespace grants via RoleBindings). A resource is allowed if
	// either check returns true, so both ClusterRoleBinding and RoleBinding-in-default
	// holders are correctly allowed.
	ClusterScoped bool
}

// AllResources is the complete ordered list of resources the sidecar watches.
// It is the single source of truth consulted by CheckAccess and the informer
// registration guards in informers.go. Add new resource types here first.
var AllResources = []ResourceDescriptor{
	// Critical — needed for the dashboard on first load
	{Resource: "nodes", Group: "", ClusterScoped: true},
	{Resource: "namespaces", Group: "", ClusterScoped: true},
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
	{Resource: "resourcequotas", Group: ""},
	{Resource: "limitranges", Group: ""},
	// Networking
	{Resource: "services", Group: ""},
	{Resource: "ingresses", Group: "networking.k8s.io"},
	{Resource: "ingressclasses", Group: "networking.k8s.io", ClusterScoped: true},
	{Resource: "networkpolicies", Group: "networking.k8s.io"},
	{Resource: "endpoints", Group: ""},
	// Config & Storage
	{Resource: "configmaps", Group: ""},
	{Resource: "secrets", Group: ""},
	{Resource: "persistentvolumeclaims", Group: ""},
	{Resource: "persistentvolumes", Group: "", ClusterScoped: true},
	{Resource: "storageclasses", Group: "storage.k8s.io", ClusterScoped: true},
	// RBAC
	{Resource: "serviceaccounts", Group: ""},
	{Resource: "roles", Group: "rbac.authorization.k8s.io"},
	{Resource: "clusterroles", Group: "rbac.authorization.k8s.io", ClusterScoped: true},
	{Resource: "rolebindings", Group: "rbac.authorization.k8s.io"},
	{Resource: "clusterrolebindings", Group: "rbac.authorization.k8s.io", ClusterScoped: true},
	// CRDs (uses a separate apiextensions client but the SAR check uses the
	// main clientset — the SAR endpoint can evaluate any API group)
	{Resource: "customresourcedefinitions", Group: "apiextensions.k8s.io", ClusterScoped: true},
}

// CheckAccessFunc is the function invoked to probe RBAC permissions. It is a
// variable so tests can substitute a stub without a live Kubernetes cluster.
var CheckAccessFunc = CheckAccess

// CheckAccess reports which resources in AllResources the caller may list and
// watch. It is a thin wrapper over CheckVerbAccessFunc that extracts the
// list+watch conjunction, keeping the two probes in sync automatically.
//
// Three possible return states:
//   - (map, nil)  — probe succeeded; check map[resource] for individual access.
//   - (nil, err)  — the SAR API itself is unavailable; callers should fall back
//     to the pre-RBAC behaviour (start all informers unconditionally).
//   - map with false values — specific resources are denied.
func CheckAccess(ctx context.Context, cs kubernetes.Interface) (map[string]bool, error) {
	verbResult, err := CheckVerbAccessFunc(ctx, cs)
	if err != nil {
		return nil, err
	}
	allowed := make(map[string]bool, len(AllResources))
	denied := 0
	for _, rd := range AllResources {
		verbs := verbResult[rd.Resource]
		ok := verbs["list"] && verbs["watch"]
		allowed[rd.Resource] = ok
		if !ok {
			denied++
		}
	}
	if denied > 0 {
		log.Printf("[RBAC] probe complete: %d/%d resources denied", denied, len(AllResources))
	}
	return allowed, nil
}

// CheckVerbAccessFunc is injectable for tests.
var CheckVerbAccessFunc = CheckVerbAccess

// CheckVerbAccess runs SelfSubjectAccessReviews for every resource in AllResources
// across 6 verbs: list, watch, delete, update, patch, create.
// Returns resource → verb → allowed. Returns (nil, err) on API failure.
//
// Like CheckAccess, namespace-scoped resources are checked with both "" and
// "default" namespaces. A verb is allowed if either namespace check passes.
func CheckVerbAccess(ctx context.Context, cs kubernetes.Interface) (map[string]map[string]bool, error) {
	type sarResult struct {
		resource string
		verb     string
		allowed  bool
	}

	verbs := []string{"list", "watch", "delete", "update", "patch", "create"}

	totalCalls := 0
	for _, rd := range AllResources {
		if rd.ClusterScoped {
			totalCalls += len(verbs)
		} else {
			totalCalls += len(verbs) * 2
		}
	}

	var (
		mu       sync.Mutex
		wg       sync.WaitGroup
		sem      = make(chan struct{}, 16)
		errCount int
		lastErr  error
	)

	results := make([]sarResult, 0, totalCalls)

	for _, rd := range AllResources {
		var namespaces []string
		if rd.ClusterScoped {
			namespaces = []string{""}
		} else {
			namespaces = []string{"", "default"}
		}
		for _, verb := range verbs {
			for _, ns := range namespaces {
				rd, verb, ns := rd, verb, ns
				wg.Add(1)
				go func() {
					defer wg.Done()
					select {
					case sem <- struct{}{}:
					case <-ctx.Done():
						mu.Lock()
						errCount++
						lastErr = ctx.Err()
						mu.Unlock()
						return
					}
					defer func() { <-sem }()

					if err := ctx.Err(); err != nil {
						mu.Lock()
						errCount++
						lastErr = err
						mu.Unlock()
						return
					}

					review := &authv1.SelfSubjectAccessReview{
						Spec: authv1.SelfSubjectAccessReviewSpec{
							ResourceAttributes: &authv1.ResourceAttributes{
								Verb:      verb,
								Resource:  rd.Resource,
								Group:     rd.Group,
								Namespace: ns,
							},
						},
					}
					resp, err := cs.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
					mu.Lock()
					defer mu.Unlock()
					if err != nil {
						errCount++
						lastErr = err
						return
					}
					results = append(results, sarResult{rd.Resource, verb, resp.Status.Allowed})
				}()
			}
		}
	}

	wg.Wait()
	// Return nil only when the SAR API is completely unreachable (all calls
	// failed). Callers treat nil as permissive (no restrictions).
	if errCount == totalCalls {
		return nil, lastErr
	}

	// OR-across-namespaces: a verb is allowed if any namespace check returned
	// true, or if all checks errored (API unreachable → permissive, not denied).
	type verbKey struct{ resource, verb string }
	hasTrue := make(map[verbKey]bool, totalCalls)
	hasFalse := make(map[verbKey]bool, totalCalls)
	for _, r := range results {
		k := verbKey{r.resource, r.verb}
		if r.allowed {
			hasTrue[k] = true
		} else {
			hasFalse[k] = true
		}
	}

	out := make(map[string]map[string]bool, len(AllResources))
	for _, rd := range AllResources {
		m := make(map[string]bool, len(verbs))
		for _, v := range verbs {
			k := verbKey{rd.Resource, v}
			m[v] = hasTrue[k] || !hasFalse[k]
		}
		out[rd.Resource] = m
	}
	return out, nil
}
