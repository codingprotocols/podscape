package helm

import (
	"fmt"
	"log"
	"os"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
	"sigs.k8s.io/yaml"
)

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

func ListReleases(kubeconfig, context, namespace string) ([]*release.Release, error) {
	actionConfig, err := newActionConfig(kubeconfig, context, namespace)
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
	actionConfig, err := newActionConfig(kubeconfig, context, namespace)
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
	actionConfig, err := newActionConfig(kubeconfig, context, namespace)
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
	actionConfig, err := newActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return nil, err
	}

	client := action.NewHistory(actionConfig)
	return client.Run(releaseName)
}

func RollbackRelease(kubeconfig, context, namespace, releaseName string, revision int) error {
	actionConfig, err := newActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return err
	}

	client := action.NewRollback(actionConfig)
	client.Version = revision
	return client.Run(releaseName)
}

func UninstallRelease(kubeconfig, context, namespace, releaseName string) (*release.UninstallReleaseResponse, error) {
	actionConfig, err := newActionConfig(kubeconfig, context, namespace)
	if err != nil {
		return nil, err
	}

	client := action.NewUninstall(actionConfig)
	return client.Run(releaseName)
}
