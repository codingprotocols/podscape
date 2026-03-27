package helm

import (
	"fmt"
	"log"
	"os"
	"sync"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
	"sigs.k8s.io/yaml"
)

// configCache caches action.Configuration instances per (kubeconfig, context, namespace)
// to avoid re-parsing the kubeconfig file and re-running k8s API discovery on every
// Helm operation. Each cache entry is keyed so context switches naturally get a fresh
// entry; ClearCache() can be called explicitly on context switch to free old entries.
var (
	configCacheMu sync.Mutex
	configCache   = map[string]*action.Configuration{}
)

// ClearCache evicts all cached action.Configuration entries. Call on context switch.
func ClearCache() {
	configCacheMu.Lock()
	configCache = map[string]*action.Configuration{}
	configCacheMu.Unlock()
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
// creating one on first use. This avoids the kubeconfig parse + k8s discovery
// overhead on every Helm request.
func getActionConfig(kubeconfig, context, namespace string) (*action.Configuration, error) {
	key := kubeconfig + "\x00" + context + "\x00" + namespace
	configCacheMu.Lock()
	defer configCacheMu.Unlock()
	if cfg, ok := configCache[key]; ok {
		return cfg, nil
	}
	cfg, err := newActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return nil, err
	}
	configCache[key] = cfg
	return cfg, nil
}

func ListReleases(kubeconfig, context, namespace string) ([]*release.Release, error) {
	actionConfig, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return nil, err
	}

	client := action.NewList(actionConfig)
	if namespace == "" {
		client.AllNamespaces = true
	}
	return client.Run()
}

func GetReleaseStatus(kubeconfig, context, namespace, releaseName string) (string, error) {
	actionConfig, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return "", err
	}

	client := action.NewStatus(actionConfig)
	rel, err := client.Run(releaseName)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("Status: %s\nUpdated: %s\nNamespace: %s", rel.Info.Status, rel.Info.LastDeployed, rel.Namespace), nil
}

func GetReleaseValues(kubeconfig, context, namespace, releaseName string, allValues bool) (string, error) {
	actionConfig, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return "", err
	}

	client := action.NewGetValues(actionConfig)
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
}

func GetReleaseHistory(kubeconfig, context, namespace, releaseName string) ([]*release.Release, error) {
	actionConfig, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return nil, err
	}

	client := action.NewHistory(actionConfig)
	return client.Run(releaseName)
}

func RollbackRelease(kubeconfig, context, namespace, releaseName string, revision int) error {
	actionConfig, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return err
	}

	client := action.NewRollback(actionConfig)
	client.Version = revision
	return client.Run(releaseName)
}

func UninstallRelease(kubeconfig, context, namespace, releaseName string) (*release.UninstallReleaseResponse, error) {
	actionConfig, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return nil, err
	}

	client := action.NewUninstall(actionConfig)
	return client.Run(releaseName)
}

func UpgradeRelease(kubeconfig, context, namespace, releaseName, valuesYAML string) error {
	actionConfig, err := getActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return err
	}

	// Fetch the current release to reuse its chart — this is a values-only
	// upgrade, not a chart version bump.
	rel, err := action.NewGet(actionConfig).Run(releaseName)
	if err != nil {
		return fmt.Errorf("failed to get current release: %w", err)
	}

	// Parse the YAML values supplied by the user.
	vals := map[string]interface{}{}
	if valuesYAML != "" {
		if err := yaml.Unmarshal([]byte(valuesYAML), &vals); err != nil {
			return fmt.Errorf("invalid YAML values: %w", err)
		}
	}

	client := action.NewUpgrade(actionConfig)
	client.Namespace = namespace
	_, err = client.Run(releaseName, rel.Chart, vals)
	return err
}
