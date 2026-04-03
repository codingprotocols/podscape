// Package ops provides reusable Kubernetes mutating operations shared by the
// CLI and MCP server. These operate on a clientset directly (no sidecar store).
package ops

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery"
	memorycache "k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/util/retry"
	"sigs.k8s.io/yaml"

	"github.com/podscape/go-core/internal/client"
)

// ErrUnsupportedResource is returned by ListResource and GetResource when the
// resource type is not handled by the typed switch. Callers can detect this
// with errors.Is and fall back to the dynamic client.
var ErrUnsupportedResource = fmt.Errorf("unsupported resource type")

// Scale sets the replica count for a deployment or statefulset.
func Scale(ctx context.Context, bundle *client.ClientBundle, ns, kind, name string, replicas int32) error {
	cs := bundle.Clientset
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		switch kind {
		case "deployment", "deployments", "deploy":
			deploy, err := cs.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			deploy.Spec.Replicas = &replicas
			_, err = cs.AppsV1().Deployments(ns).Update(ctx, deploy, metav1.UpdateOptions{})
			return err
		case "statefulset", "statefulsets", "sts":
			sts, err := cs.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			sts.Spec.Replicas = &replicas
			_, err = cs.AppsV1().StatefulSets(ns).Update(ctx, sts, metav1.UpdateOptions{})
			return err
		default:
			return fmt.Errorf("unsupported kind for scale: %s (supported: deployment, statefulset)", kind)
		}
	})
}

// KindGVR maps lowercase kind names to GroupVersionResource for delete operations.
var KindGVR = map[string]schema.GroupVersionResource{
	"pod":                     {Group: "", Version: "v1", Resource: "pods"},
	"deployment":              {Group: "apps", Version: "v1", Resource: "deployments"},
	"service":                 {Group: "", Version: "v1", Resource: "services"},
	"configmap":               {Group: "", Version: "v1", Resource: "configmaps"},
	"secret":                  {Group: "", Version: "v1", Resource: "secrets"},
	"ingress":                 {Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"},
	"statefulset":             {Group: "apps", Version: "v1", Resource: "statefulsets"},
	"daemonset":               {Group: "apps", Version: "v1", Resource: "daemonsets"},
	"replicaset":              {Group: "apps", Version: "v1", Resource: "replicasets"},
	"job":                     {Group: "batch", Version: "v1", Resource: "jobs"},
	"cronjob":                 {Group: "batch", Version: "v1", Resource: "cronjobs"},
	"hpa":                     {Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"},
	"pdb":                     {Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"},
	"networkpolicy":           {Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"},
	"pvc":                     {Group: "", Version: "v1", Resource: "persistentvolumeclaims"},
	"pv":                      {Group: "", Version: "v1", Resource: "persistentvolumes"},
	"storageclass":            {Group: "storage.k8s.io", Version: "v1", Resource: "storageclasses"},
	"serviceaccount":          {Group: "", Version: "v1", Resource: "serviceaccounts"},
	"role":                    {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"},
	"clusterrole":             {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"},
	"rolebinding":             {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"},
	"clusterrolebinding":      {Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"},
	"node":                    {Group: "", Version: "v1", Resource: "nodes"},
	"namespace":               {Group: "", Version: "v1", Resource: "namespaces"},
}

// ClusterScoped returns true if the kind is cluster-scoped.
var ClusterScoped = map[string]bool{
	"pv": true, "storageclass": true, "clusterrole": true,
	"clusterrolebinding": true, "node": true, "namespace": true,
}

// dynClientFactory is an injectable factory used by Delete and ApplyYAML.
// Tests replace this to inject a fake dynamic client without a real API server.
var dynClientFactory = func(cfg *rest.Config) (dynamic.Interface, error) {
	return dynamic.NewForConfig(cfg)
}

// Delete removes a resource by kind and name.
func Delete(ctx context.Context, bundle *client.ClientBundle, ns, kind, name string) error {
	gvr, ok := KindGVR[kind]
	if !ok {
		return fmt.Errorf("unsupported kind: %s", kind)
	}
	dynClient, err := dynClientFactory(bundle.Config)
	if err != nil {
		return err
	}
	if ClusterScoped[kind] {
		return dynClient.Resource(gvr).Delete(ctx, name, metav1.DeleteOptions{})
	}
	return dynClient.Resource(gvr).Namespace(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

// RolloutRestart triggers a rolling restart by patching the restartedAt annotation.
func RolloutRestart(ctx context.Context, bundle *client.ClientBundle, ns, kind, name string) error {
	cs := bundle.Clientset
	data := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().Format(time.RFC3339),
	)
	patch := []byte(data)
	var err error
	switch kind {
	case "deployment", "deployments", "deploy":
		_, err = cs.AppsV1().Deployments(ns).Patch(ctx, name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	case "daemonset", "daemonsets", "ds":
		_, err = cs.AppsV1().DaemonSets(ns).Patch(ctx, name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	case "statefulset", "statefulsets", "sts":
		_, err = cs.AppsV1().StatefulSets(ns).Patch(ctx, name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	default:
		return fmt.Errorf("unsupported kind for rollout restart: %s", kind)
	}
	return err
}

// RolloutUndo reverts a deployment to a previous revision. If revision is 0,
// it reverts to the immediately prior revision.
func RolloutUndo(ctx context.Context, bundle *client.ClientBundle, ns, kind, name string, revision int64) error {
	cs := bundle.Clientset
	if kind != "deployment" && kind != "deployments" && kind != "deploy" {
		return fmt.Errorf("rollout undo only supports deployments, got: %s", kind)
	}
	deploy, err := cs.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("getting deployment: %w", err)
	}

	selector, err := metav1.LabelSelectorAsSelector(deploy.Spec.Selector)
	if err != nil {
		return fmt.Errorf("building label selector: %w", err)
	}
	rsList, err := cs.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{
		LabelSelector: selector.String(),
	})
	if err != nil {
		return fmt.Errorf("listing replicasets: %w", err)
	}

	// Filter to those owned by this deployment.
	owned := make([]appsv1.ReplicaSet, 0)
	for _, rs := range rsList.Items {
		for _, ref := range rs.OwnerReferences {
			if ref.UID == deploy.UID {
				owned = append(owned, rs)
				break
			}
		}
	}

	if len(owned) == 0 {
		return fmt.Errorf("no replicasets found for deployment %s", name)
	}

	// Find the target ReplicaSet.
	var targetRS *appsv1.ReplicaSet
	if revision == 0 {
		// Find the second-highest revision (undo to previous).
		var maxRev, secondRev int64
		var maxRS, secondRS *appsv1.ReplicaSet
		for i := range owned {
			rev, ok := ParseRevision(owned[i].Annotations)
			if !ok {
				continue
			}
			if rev > maxRev {
				secondRev = maxRev
				secondRS = maxRS
				maxRev = rev
				maxRS = &owned[i]
			} else if rev > secondRev {
				secondRev = rev
				secondRS = &owned[i]
			}
		}
		_ = maxRS
		if secondRS == nil {
			return fmt.Errorf("no previous revision found to undo to")
		}
		targetRS = secondRS
	} else {
		for i := range owned {
			rev, ok := ParseRevision(owned[i].Annotations)
			if ok && rev == revision {
				targetRS = &owned[i]
				break
			}
		}
		if targetRS == nil {
			return fmt.Errorf("revision %d not found", revision)
		}
	}

	// Patch the deployment's pod template to match the target ReplicaSet.
	// StrategicMergePatch requires JSON — use encoding/json, not sigs.k8s.io/yaml.
	patchData, err := json.Marshal(map[string]interface{}{
		"spec": map[string]interface{}{
			"template": targetRS.Spec.Template,
		},
	})
	if err != nil {
		return fmt.Errorf("marshalling patch: %w", err)
	}
	_, err = cs.AppsV1().Deployments(ns).Patch(ctx, name, types.StrategicMergePatchType, patchData, metav1.PatchOptions{})
	return err
}

// ParseRevision reads the "deployment.kubernetes.io/revision" annotation and
// returns (revision, true) on success, or (0, false) if the annotation is
// absent or non-numeric.
func ParseRevision(ann map[string]string) (int64, bool) {
	s, ok := ann["deployment.kubernetes.io/revision"]
	if !ok || s == "" {
		return 0, false
	}
	v, err := strconv.ParseInt(s, 10, 64)
	return v, err == nil
}

// ApplyYAML applies a YAML manifest using server-side apply.
func ApplyYAML(ctx context.Context, bundle *client.ClientBundle, yamlBytes []byte) error {
	cfg := bundle.Config
	obj := &unstructured.Unstructured{}
	if err := yaml.Unmarshal(yamlBytes, obj); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	// Strip server-managed fields: managedFields is rejected outright; status is
	// owned by the controller and ignored by the API server anyway — excluding it
	// keeps field ownership clean and reduces payload size.
	obj.SetManagedFields(nil)
	delete(obj.Object, "status")

	// Strip read-only or server-generated metadata fields that interfere with apply
	if metadata, ok := obj.Object["metadata"].(map[string]interface{}); ok {
		delete(metadata, "uid")
		delete(metadata, "resourceVersion")
		delete(metadata, "creationTimestamp")
		delete(metadata, "generation")
	}

	dc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		return err
	}
	dyn, err := dynClientFactory(cfg)
	if err != nil {
		return err
	}

	// DeferredDiscoveryRESTMapper lazily fetches and caches API group resources,
	// avoiding a full discovery round-trip on every apply call.
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memorycache.NewMemCacheClient(dc))
	gvk := obj.GroupVersionKind()
	mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
	if err != nil {
		return err
	}

	var resource dynamic.ResourceInterface
	if mapping.Scope.Name() == "namespace" {
		ns := obj.GetNamespace()
		if ns == "" {
			ns = "default"
		}
		resource = dyn.Resource(mapping.Resource).Namespace(ns)
	} else {
		resource = dyn.Resource(mapping.Resource)
	}

	patchBytes, err := json.Marshal(obj.Object)
	if err != nil {
		return fmt.Errorf("failed to marshal manifest: %w", err)
	}
	force := true
	_, err = resource.Patch(ctx, obj.GetName(), types.ApplyPatchType, patchBytes, metav1.PatchOptions{
		FieldManager: "podscape-cli",
		Force:        &force,
	})
	if err != nil {
		if strings.Contains(err.Error(), "pod updates may not change fields") {
			return fmt.Errorf("pod spec fields are immutable after creation — edit the parent Deployment or StatefulSet instead of the Pod directly")
		}
		return err
	}
	return nil
}

// ListResource lists all resources of the given type in the given namespace.
// ns may be empty for cluster-scoped or all-namespace queries.
// An optional metav1.ListOptions may be passed to filter by label selector, field selector, etc.
func ListResource(ctx context.Context, bundle *client.ClientBundle, resource, ns string, opts ...metav1.ListOptions) (interface{}, error) {
	cs := bundle.Clientset
	lo := metav1.ListOptions{}
	if len(opts) > 0 {
		lo = opts[0]
	}
	switch resource {
	case "pods", "pod":
		l, e := cs.CoreV1().Pods(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "deployments", "deployment":
		l, e := cs.AppsV1().Deployments(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "services", "service":
		l, e := cs.CoreV1().Services(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "nodes", "node":
		l, e := cs.CoreV1().Nodes().List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "namespaces", "namespace":
		l, e := cs.CoreV1().Namespaces().List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "configmaps", "configmap":
		l, e := cs.CoreV1().ConfigMaps(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "secrets", "secret":
		l, e := cs.CoreV1().Secrets(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "statefulsets", "statefulset":
		l, e := cs.AppsV1().StatefulSets(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "daemonsets", "daemonset":
		l, e := cs.AppsV1().DaemonSets(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "jobs", "job":
		l, e := cs.BatchV1().Jobs(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "cronjobs", "cronjob":
		l, e := cs.BatchV1().CronJobs(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "ingresses", "ingress":
		l, e := cs.NetworkingV1().Ingresses(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	case "events", "event":
		l, e := cs.CoreV1().Events(ns).List(ctx, lo)
		if e != nil {
			return nil, e
		}
		return l.Items, nil
	default:
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedResource, resource)
	}
}

// GetResource fetches a single resource by kind and name.
func GetResource(ctx context.Context, bundle *client.ClientBundle, resource, name, ns string) (interface{}, error) {
	cs := bundle.Clientset
	switch resource {
	case "pods", "pod":
		return cs.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
	case "deployments", "deployment":
		return cs.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	case "services", "service":
		return cs.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
	case "nodes", "node":
		return cs.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
	case "namespaces", "namespace":
		return cs.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
	case "configmaps", "configmap":
		return cs.CoreV1().ConfigMaps(ns).Get(ctx, name, metav1.GetOptions{})
	case "secrets", "secret":
		return cs.CoreV1().Secrets(ns).Get(ctx, name, metav1.GetOptions{})
	case "statefulsets", "statefulset":
		return cs.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
	case "daemonsets", "daemonset":
		return cs.AppsV1().DaemonSets(ns).Get(ctx, name, metav1.GetOptions{})
	case "jobs", "job":
		return cs.BatchV1().Jobs(ns).Get(ctx, name, metav1.GetOptions{})
	case "cronjobs", "cronjob":
		return cs.BatchV1().CronJobs(ns).Get(ctx, name, metav1.GetOptions{})
	case "ingresses", "ingress":
		return cs.NetworkingV1().Ingresses(ns).Get(ctx, name, metav1.GetOptions{})
	default:
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedResource, resource)
	}
}

