package k8sutil

import (
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// KindGVR maps the lowercase kind name used in API query params to its
// Kubernetes GroupVersionResource.
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
	"horizontalpodautoscaler": {Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"},
	"poddisruptionbudget":     {Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"},
	"ingressclass":            {Group: "networking.k8s.io", Version: "v1", Resource: "ingressclasses"},
	"networkpolicy":           {Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"},
	"endpoints":               {Group: "", Version: "v1", Resource: "endpoints"},
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
	"crd":                     {Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"},
	// Aliases
	"hpa":                      {Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"},
	"pdb":                      {Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"},
	"persistentvolumeclaim":    {Group: "", Version: "v1", Resource: "persistentvolumeclaims"},
	"persistentvolume":         {Group: "", Version: "v1", Resource: "persistentvolumes"},
	"customresourcedefinition": {Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"},
}

// KindGVRFallback contains older API version fallbacks for kinds where KindGVR
// uses a newer preferred version that may not be available on older clusters.
// Callers should retry with the fallback when the primary GVR returns NotFound,
// which may indicate the API version is not registered on the server.
var KindGVRFallback = map[string]schema.GroupVersionResource{
	"horizontalpodautoscaler": {Group: "autoscaling", Version: "v1", Resource: "horizontalpodautoscalers"},
	"hpa":                     {Group: "autoscaling", Version: "v1", Resource: "horizontalpodautoscalers"},
}

// ClusterScopedKinds are not namespace-scoped; calls must omit the namespace.
var ClusterScopedKinds = map[string]bool{
	"pv": true, "persistentvolume": true, "storageclass": true, "ingressclass": true,
	"clusterrole": true, "clusterrolebinding": true,
	"node": true, "namespace": true, "crd": true, "customresourcedefinition": true,
}
