package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"github.com/podscape/go-core/internal/handlers"
	"github.com/podscape/go-core/internal/informers"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/store"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

func main() {
	var kubeconfig *string
	if home := homedir.HomeDir(); home != "" {
		kubeconfig = flag.String("kubeconfig", "", "(optional) absolute path to the kubeconfig file")
	} else {
		kubeconfig = flag.String("kubeconfig", "", "absolute path to the kubeconfig file")
	}
	port := flag.String("port", "5050", "port to listen on")
	flag.Parse()

	config, err := clientcmd.BuildConfigFromFlags("", *kubeconfig)
	if err != nil {
		log.Fatalf("Error building kubeconfig: %s", err.Error())
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Error creating kubernetes client: %v", err)
	}

	store.Store.Clientset = clientset
	store.Store.Config = config
	store.Store.Kubeconfig = *kubeconfig
	portforward.Init(clientset, config)

	stopCh := make(chan struct{})
	defer close(stopCh)

	informers.InitInformers(clientset, stopCh)

	fmt.Printf("Go sidecar started on port %s using kubeconfig: %s\n", *port, *kubeconfig)

	http.HandleFunc("/nodes", handlers.HandleNodes)
	http.HandleFunc("/namespaces", handlers.HandleNamespaces)
	http.HandleFunc("/pods", handlers.HandlePods)
	http.HandleFunc("/deployments", handlers.HandleDeployments)
	http.HandleFunc("/daemonsets", handlers.HandleDaemonSets)
	http.HandleFunc("/statefulsets", handlers.HandleStatefulSets)
	http.HandleFunc("/replicasets", handlers.HandleReplicaSets)
	http.HandleFunc("/jobs", handlers.HandleJobs)
	http.HandleFunc("/cronjobs", handlers.HandleCronJobs)
	http.HandleFunc("/hpas", handlers.HandleHPAs)
	http.HandleFunc("/pdbs", handlers.HandlePDBs)

	http.HandleFunc("/services", handlers.HandleServices)
	http.HandleFunc("/ingresses", handlers.HandleIngresses)
	http.HandleFunc("/ingressclasses", handlers.HandleIngressClasses)
	http.HandleFunc("/networkpolicies", handlers.HandleNetworkPolicies)
	http.HandleFunc("/endpoints", handlers.HandleEndpoints)

	http.HandleFunc("/configmaps", handlers.HandleConfigMaps)
	http.HandleFunc("/secrets", handlers.HandleSecrets)
	http.HandleFunc("/pvcs", handlers.HandlePVCs)
	http.HandleFunc("/pvs", handlers.HandlePVs)
	http.HandleFunc("/storageclasses", handlers.HandleStorageClasses)

	http.HandleFunc("/serviceaccounts", handlers.HandleServiceAccounts)
	http.HandleFunc("/roles", handlers.HandleRoles)
	http.HandleFunc("/clusterroles", handlers.HandleClusterRoles)
	http.HandleFunc("/rolebindings", handlers.HandleRoleBindings)
	http.HandleFunc("/clusterrolebindings", handlers.HandleClusterRoleBindings)
	http.HandleFunc("/crds", handlers.HandleCRDs)
	http.HandleFunc("/events", handlers.HandleEvents)
	http.HandleFunc("/helm/list", handlers.HandleHelmList)
	http.HandleFunc("/helm/status", handlers.HandleHelmStatus)
	http.HandleFunc("/helm/values", handlers.HandleHelmValues)
	http.HandleFunc("/helm/history", handlers.HandleHelmHistory)
	http.HandleFunc("/logs", handlers.HandleLogs)
	http.HandleFunc("/portforward", handlers.HandlePortForward)
	http.HandleFunc("/stopPortForward", handlers.HandleStopPortForward)

	http.HandleFunc("/scale", handlers.HandleScale)
	http.HandleFunc("/delete", handlers.HandleDelete)
	http.HandleFunc("/rollout/restart", handlers.HandleRolloutRestart)
	http.HandleFunc("/rollout/history", handlers.HandleRolloutHistory)
	http.HandleFunc("/rollout/undo", handlers.HandleRolloutUndo)
	http.HandleFunc("/getYAML", handlers.HandleGetYAML)
	http.HandleFunc("/apply", handlers.HandleApplyYAML)
	http.HandleFunc("/secret/value", handlers.HandleGetSecretValue)
	http.HandleFunc("/exec", handlers.HandleExec)
	http.HandleFunc("/exec/oneshot", handlers.HandleExecOneShot)
	http.HandleFunc("/cp/from", handlers.HandleCPFrom)
	http.HandleFunc("/cp/to", handlers.HandleCPTo)
	http.HandleFunc("/config/contexts", handlers.HandleGetContexts)
	http.HandleFunc("/config/current-context", handlers.HandleGetCurrentContext)
	http.HandleFunc("/config/switch", handlers.HandleSwitchContext)
	http.HandleFunc("/helm/rollback", handlers.HandleHelmRollback)
	http.HandleFunc("/helm/uninstall", handlers.HandleHelmUninstall)
	http.HandleFunc("/metrics/pods", handlers.HandleGetPodMetrics)
	http.HandleFunc("/metrics/nodes", handlers.HandleGetNodeMetrics)
	http.HandleFunc("/debugpod/create", handlers.HandleCreateDebugPod)
	http.HandleFunc("/topology", handlers.HandleTopology)
	http.HandleFunc("/health", handlers.HandleHealth)

	log.Fatal(http.ListenAndServe("127.0.0.1:"+*port, nil))
}
