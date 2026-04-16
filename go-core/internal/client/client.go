// Package client provides shared Kubernetes client initialization used by all
// Podscape binaries (sidecar, CLI, MCP server).
package client

import (
	"fmt"
	"os"
	"path/filepath"

	apiextensionsclientset "k8s.io/apiextensions-apiserver/pkg/client/clientset/clientset"
	"k8s.io/client-go/discovery"
	memorycache "k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// ClientBundle holds the fully-initialized Kubernetes clients, REST config,
// and metadata about the active context.
type ClientBundle struct {
	Clientset    kubernetes.Interface
	ApiextClient apiextensionsclientset.Interface
	DynClient    dynamic.Interface
	Discovery    discovery.DiscoveryInterface
	Config       *rest.Config
	ContextName  string
	Kubeconfig   string
}

// Init builds a ClientBundle from the given kubeconfig path.
// Resolution order: explicit path → $KUBECONFIG → ~/.kube/config.
func Init(kubeconfig string) (*ClientBundle, error) {
	kubeconfig = resolveKubeconfig(kubeconfig)

	config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("building kubeconfig from %q: %w", kubeconfig, err)
	}

	// Match the sidecar's tuning so LIST calls are not throttled.
	config.QPS = 50
	config.Burst = 100
	config.WarningHandler = rest.NoWarnings{}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("creating kubernetes client: %w", err)
	}

	apiextClient, err := apiextensionsclientset.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("creating apiextensions client: %w", err)
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("creating dynamic client: %w", err)
	}

	// Determine the active context name.
	contextName := "__default__"
	if data, loadErr := clientcmd.LoadFromFile(kubeconfig); loadErr == nil && data.CurrentContext != "" {
		contextName = data.CurrentContext
	}

	return &ClientBundle{
		Clientset:    clientset,
		ApiextClient: apiextClient,
		DynClient:    dynClient,
		Discovery:    memorycache.NewMemCacheClient(clientset.Discovery()),
		Config:       config,
		ContextName:  contextName,
		Kubeconfig:   kubeconfig,
	}, nil
}

// InitWithContext is like Init but connects to a specific named context
// rather than the kubeconfig's current-context.
func InitWithContext(kubeconfig, contextName string) (*ClientBundle, error) {
	kubeconfig = resolveKubeconfig(kubeconfig)

	loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfig}
	overrides := &clientcmd.ConfigOverrides{CurrentContext: contextName}
	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, overrides)

	config, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("building kubeconfig for context %q: %w", contextName, err)
	}

	config.QPS = 50
	config.Burst = 100
	config.WarningHandler = rest.NoWarnings{}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("creating kubernetes client: %w", err)
	}
	apiextClient, err := apiextensionsclientset.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("creating apiextensions client: %w", err)
	}
	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("creating dynamic client: %w", err)
	}

	return &ClientBundle{
		Clientset:    clientset,
		ApiextClient: apiextClient,
		DynClient:    dynClient,
		Discovery:    memorycache.NewMemCacheClient(clientset.Discovery()),
		Config:       config,
		ContextName:  contextName,
		Kubeconfig:   kubeconfig,
	}, nil
}

// ValidateContext returns an error if contextName is not present in the kubeconfig file.
func ValidateContext(kubeconfig, contextName string) error {
	kubeconfig = resolveKubeconfig(kubeconfig)
	cfg, err := clientcmd.LoadFromFile(kubeconfig)
	if err != nil {
		return fmt.Errorf("loading kubeconfig: %w", err)
	}
	if _, ok := cfg.Contexts[contextName]; !ok {
		return fmt.Errorf("context %q not found in kubeconfig", contextName)
	}
	return nil
}

// resolveKubeconfig returns the first valid kubeconfig path from:
// 1. The explicit argument (if non-empty)
// 2. $KUBECONFIG environment variable
// 3. ~/.kube/config
func resolveKubeconfig(explicit string) string {
	if explicit != "" {
		return explicit
	}
	if env := os.Getenv("KUBECONFIG"); env != "" {
		return env
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".kube", "config")
}
