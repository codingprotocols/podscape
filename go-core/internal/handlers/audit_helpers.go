package handlers

import (
	"strings"

	"k8s.io/client-go/rest"

	"github.com/podscape/go-core/internal/audit"
	"github.com/podscape/go-core/internal/store"
)

// auditIdentity resolves the identity fields shared by every audit.Event
// recorded from this package: the active kube context name, the kubeconfig
// user it maps to, and (best-effort) any client-certificate Subject CN on
// cfg. cfg may be nil (some call sites don't have one, e.g. after an error
// path) — ResolveIdentity handles that gracefully.
func auditIdentity(cfg *rest.Config) (kubeContext, kubeUser, certCN string) {
	kubeContext = store.Store.ActiveContextName
	kubeUser, certCN = audit.ResolveIdentity(store.Store.Kubeconfig, kubeContext, cfg)
	return
}

// auditKind maps the lowercase "kind" query parameter used throughout the
// mutating handlers (e.g. "deployment", "statefulset") to its canonical
// Kubernetes Kind name for the audit log, so every entry has a consistently
// capitalized resource_kind. Falls back to title-casing any kind not
// explicitly listed.
func auditKind(kind string) string {
	known := map[string]string{
		"deployment":  "Deployment",
		"statefulset": "StatefulSet",
		"daemonset":   "DaemonSet",
		"pod":         "Pod",
		"cronjob":     "CronJob",
		"job":         "Job",
		"service":     "Service",
		"configmap":   "ConfigMap",
		"secret":      "Secret",
		"node":        "Node",
	}
	if v, ok := known[strings.ToLower(kind)]; ok {
		return v
	}
	if kind == "" {
		return ""
	}
	return strings.ToUpper(kind[:1]) + kind[1:]
}
