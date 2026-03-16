package helm

import (
	"fmt"
	"log"
	"os"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
)

func ListReleases(kubeconfig, context, namespace string) ([]*release.Release, error) {
	settings := cli.New()
	if kubeconfig != "" {
		settings.KubeConfig = kubeconfig
	}
	if context != "" {
		settings.KubeContext = context
	}

	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, os.Getenv("HELM_DRIVER"), log.Printf); err != nil {
		return nil, err
	}

	client := action.NewList(actionConfig)
	if namespace == "" {
		client.AllNamespaces = true
	}
	return client.Run()
}

func GetReleaseStatus(namespace, releaseName string) (string, error) {
	settings := cli.New()
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, os.Getenv("HELM_DRIVER"), log.Printf); err != nil {
		return "", err
	}

	client := action.NewStatus(actionConfig)
	rel, err := client.Run(releaseName)
	if err != nil {
		return "", err
	}

	// Simplifying status output
	return fmt.Sprintf("Status: %s\nUpdated: %s\nNamespace: %s", rel.Info.Status, rel.Info.LastDeployed, rel.Namespace), nil
}

func GetReleaseValues(namespace, releaseName string, allValues bool) (string, error) {
	settings := cli.New()
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, os.Getenv("HELM_DRIVER"), log.Printf); err != nil {
		return "", err
	}

	client := action.NewGetValues(actionConfig)
	client.AllValues = allValues
	vals, err := client.Run(releaseName)
	if err != nil {
		return "", err
	}

	// In a real app, you'd likely marshal this to YAML
	return fmt.Sprintf("%v", vals), nil
}

func GetReleaseHistory(namespace, releaseName string) ([]*release.Release, error) {
	settings := cli.New()
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, os.Getenv("HELM_DRIVER"), log.Printf); err != nil {
		return nil, err
	}

	client := action.NewHistory(actionConfig)
	return client.Run(releaseName)
}

func RollbackRelease(namespace, releaseName string, revision int) error {
	settings := cli.New()
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, os.Getenv("HELM_DRIVER"), log.Printf); err != nil {
		return err
	}

	client := action.NewRollback(actionConfig)
	client.Version = revision
	return client.Run(releaseName)
}

func UninstallRelease(namespace, releaseName string) (*release.UninstallReleaseResponse, error) {
	settings := cli.New()
	actionConfig := new(action.Configuration)
	if err := actionConfig.Init(settings.RESTClientGetter(), namespace, os.Getenv("HELM_DRIVER"), log.Printf); err != nil {
		return nil, err
	}

	client := action.NewUninstall(actionConfig)
	return client.Run(releaseName)
}
