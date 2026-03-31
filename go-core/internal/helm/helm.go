package helm

import (
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
	"sigs.k8s.io/yaml"
)

// configCacheEntry holds a cached action.Configuration with an expiry time.
// The expiry prevents stale HTTP/2 connections from accumulating indefinitely
// in long-running sessions (e.g. EKS idle-timeout resets a connection after
// ~5 minutes; re-using the cached config after that causes INTERNAL_ERROR).
type configCacheEntry struct {
	cfg    *action.Configuration
	expiry time.Time
}

const configCacheTTL = 10 * time.Minute

var (
	configCacheMu sync.Mutex
	configCache   = map[string]configCacheEntry{}
)

func init() {
	go func() {
		for range time.Tick(configCacheTTL) {
			now := time.Now()
			configCacheMu.Lock()
			for k, e := range configCache {
				if now.After(e.expiry) {
					delete(configCache, k)
				}
			}
			configCacheMu.Unlock()
		}
	}()
}

// ClearCache evicts all cached action.Configuration entries. Call on context switch.
func ClearCache() {
	configCacheMu.Lock()
	configCache = map[string]configCacheEntry{}
	configCacheMu.Unlock()
}

// evictActionConfig removes a single cache entry so the next call rebuilds it.
// Called after a transient connection error to force a fresh HTTP client on retry.
func evictActionConfig(kubeconfig, context, namespace string) {
	key := kubeconfig + "\x00" + context + "\x00" + namespace
	configCacheMu.Lock()
	delete(configCache, key)
	configCacheMu.Unlock()
}

// isTransientError returns true for network-level errors caused by a stale
// HTTP/2 connection (e.g. EKS idle-timeout stream resets) that can be resolved
// by opening a fresh connection. "EOF" alone is intentionally excluded — it is
// returned for many non-network conditions; "unexpected EOF" is the specific
// string produced by net/http on a mid-response connection drop.
func isTransientError(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "stream error") ||
		strings.Contains(s, "INTERNAL_ERROR") ||
		strings.Contains(s, "use of closed network connection") ||
		strings.Contains(s, "connection reset by peer") ||
		strings.Contains(s, "unexpected EOF")
}

func newSettings(kubeconfig, context string) *cli.EnvSettings {
	settings := cli.New()
	if kubeconfig != "" {
		settings.KubeConfig = kubeconfig
	}
	if context != "" {
		settings.KubeContext = context
	}
	return settings
}

func newActionConfig(kubeconfig, context, namespace string) (*action.Configuration, error) {
	settings := newSettings(kubeconfig, context)
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, os.Getenv("HELM_DRIVER"), log.Printf); err != nil {
		return nil, err
	}
	return actionConfig, nil
}

// getActionConfig returns a cached action.Configuration for the given coordinates,
// creating one on first use or after the TTL expires. This avoids the kubeconfig
// parse + k8s discovery overhead on every Helm request.
func getActionConfig(kubeconfig, context, namespace string) (*action.Configuration, error) {
	key := kubeconfig + "\x00" + context + "\x00" + namespace
	configCacheMu.Lock()
	defer configCacheMu.Unlock()
	if e, ok := configCache[key]; ok && time.Now().Before(e.expiry) {
		return e.cfg, nil
	}
	cfg, err := newActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return nil, err
	}
	configCache[key] = configCacheEntry{cfg: cfg, expiry: time.Now().Add(configCacheTTL)}
	return cfg, nil
}

// helmRun executes op with a cached action.Configuration.
//
// When readOnly is true (safe for idempotent reads): on a transient network error
// (stale HTTP/2 stream), the cache entry is evicted and the operation retried once
// with a freshly-created configuration.
//
// When readOnly is false (mutations): the cache entry is evicted on error so the
// next caller gets a fresh connection, but the operation is NOT retried. Retrying
// a write (upgrade, rollback, uninstall) is unsafe because the server may have
// already committed the change before the stream was reset.
func helmRun[T any](kubeconfig, context, namespace string, readOnly bool, op func(*action.Configuration) (T, error)) (T, error) {
	cfg, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		var zero T
		return zero, err
	}
	result, err := op(cfg)
	if err != nil && isTransientError(err) {
		evictActionConfig(kubeconfig, context, namespace)
		if !readOnly {
			return result, err
		}
		cfg, err = getActionConfig(kubeconfig, context, namespace)
		if err != nil {
			return result, err
		}
		result, err = op(cfg)
	}
	return result, err
}

func ListReleases(kubeconfig, context, namespace string) ([]*release.Release, error) {
	return helmRun(kubeconfig, context, namespace, true, func(cfg *action.Configuration) ([]*release.Release, error) {
		client := action.NewList(cfg)
		if namespace == "" {
			client.AllNamespaces = true
		}
		return client.Run()
	})
}

func GetReleaseStatus(kubeconfig, context, namespace, releaseName string) (string, error) {
	return helmRun(kubeconfig, context, namespace, true, func(cfg *action.Configuration) (string, error) {
		rel, err := action.NewStatus(cfg).Run(releaseName)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Status: %s\nUpdated: %s\nNamespace: %s", rel.Info.Status, rel.Info.LastDeployed, rel.Namespace), nil
	})
}

func GetReleaseValues(kubeconfig, context, namespace, releaseName string, allValues bool) (string, error) {
	return helmRun(kubeconfig, context, namespace, true, func(cfg *action.Configuration) (string, error) {
		client := action.NewGetValues(cfg)
		client.AllValues = allValues
		vals, err := client.Run(releaseName)
		if err != nil {
			return "", err
		}
		out, err := yaml.Marshal(vals)
		if err != nil {
			return fmt.Sprintf("%v", vals), nil
		}
		return string(out), nil
	})
}

func GetReleaseHistory(kubeconfig, context, namespace, releaseName string) ([]*release.Release, error) {
	return helmRun(kubeconfig, context, namespace, true, func(cfg *action.Configuration) ([]*release.Release, error) {
		return action.NewHistory(cfg).Run(releaseName)
	})
}

func RollbackRelease(kubeconfig, context, namespace, releaseName string, revision int) error {
	_, err := helmRun(kubeconfig, context, namespace, false, func(cfg *action.Configuration) (struct{}, error) {
		client := action.NewRollback(cfg)
		client.Version = revision
		return struct{}{}, client.Run(releaseName)
	})
	return err
}

func UninstallRelease(kubeconfig, context, namespace, releaseName string) (*release.UninstallReleaseResponse, error) {
	return helmRun(kubeconfig, context, namespace, false, func(cfg *action.Configuration) (*release.UninstallReleaseResponse, error) {
		return action.NewUninstall(cfg).Run(releaseName)
	})
}

func UpgradeRelease(kubeconfig, context, namespace, releaseName, valuesYAML string) error {
	// Parse values before acquiring a connection — fail fast on bad YAML.
	vals := map[string]interface{}{}
	if valuesYAML != "" {
		if err := yaml.Unmarshal([]byte(valuesYAML), &vals); err != nil {
			return fmt.Errorf("invalid YAML values: %w", err)
		}
	}

	_, err := helmRun(kubeconfig, context, namespace, false, func(cfg *action.Configuration) (struct{}, error) {
		// Fetch the current release to reuse its chart — values-only upgrade.
		rel, err := action.NewGet(cfg).Run(releaseName)
		if err != nil {
			return struct{}{}, fmt.Errorf("failed to get current release: %w", err)
		}
		client := action.NewUpgrade(cfg)
		client.Namespace = namespace
		_, err = client.Run(releaseName, rel.Chart, vals)
		return struct{}{}, err
	})
	return err
}
