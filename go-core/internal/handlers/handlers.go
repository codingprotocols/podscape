package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/exec"
	"github.com/podscape/go-core/internal/helm"
	"github.com/podscape/go-core/internal/logs"
	"github.com/podscape/go-core/internal/portforward"
	"github.com/podscape/go-core/internal/store"
	"github.com/podscape/go-core/internal/topology"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/util/retry"
	"sigs.k8s.io/yaml"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Generic handler factory with optional namespace filtering
func MakeHandler(targetMap func() map[string]interface{}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ns := r.URL.Query().Get("namespace")
		store.Store.RLock()
		data := targetMap()
		items := make([]interface{}, 0, len(data))
		for _, v := range data {
			if ns != "" {
				// Try to use metav1.Object interface (works for pointers to K8s structs)
				if obj, ok := v.(metav1.Object); ok {
					if obj.GetNamespace() != "" && obj.GetNamespace() != ns {
						continue
					}
				} else if m, ok := v.(map[string]interface{}); ok {
					// Fallback for map-based objects
					if meta, ok := m["metadata"].(map[string]interface{}); ok {
						if mns, ok := meta["namespace"].(string); ok && mns != "" && mns != ns {
							continue
						}
					}
				}
			}
			items = append(items, v)
		}
		store.Store.RUnlock()

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(items)
	}
}

func HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// Specific handlers for common resources
var (
	HandleNodes       = MakeHandler(func() map[string]interface{} { return store.Store.Nodes })
	HandlePods        = MakeHandler(func() map[string]interface{} { return store.Store.Pods })
	HandleDeployments = MakeHandler(func() map[string]interface{} { return store.Store.Deployments })

	// Workloads
	HandleDaemonSets   = MakeHandler(func() map[string]interface{} { return store.Store.DaemonSets })
	HandleStatefulSets = MakeHandler(func() map[string]interface{} { return store.Store.StatefulSets })
	HandleReplicaSets  = MakeHandler(func() map[string]interface{} { return store.Store.ReplicaSets })
	HandleJobs         = MakeHandler(func() map[string]interface{} { return store.Store.Jobs })
	HandleCronJobs     = MakeHandler(func() map[string]interface{} { return store.Store.CronJobs })
	HandleHPAs         = MakeHandler(func() map[string]interface{} { return store.Store.HPAs })
	HandlePDBs         = MakeHandler(func() map[string]interface{} { return store.Store.PDBs })

	// Networking
	HandleServices        = MakeHandler(func() map[string]interface{} { return store.Store.Services })
	HandleIngresses       = MakeHandler(func() map[string]interface{} { return store.Store.Ingresses })
	HandleIngressClasses  = MakeHandler(func() map[string]interface{} { return store.Store.IngressClasses })
	HandleNetworkPolicies = MakeHandler(func() map[string]interface{} { return store.Store.NetworkPolicies })
	HandleEndpoints       = MakeHandler(func() map[string]interface{} { return store.Store.Endpoints })

	// Config & Storage
	HandleConfigMaps     = MakeHandler(func() map[string]interface{} { return store.Store.ConfigMaps })
	HandleSecrets        = MakeHandler(func() map[string]interface{} { return store.Store.Secrets })
	HandlePVCs           = MakeHandler(func() map[string]interface{} { return store.Store.PVCs })
	HandlePVs            = MakeHandler(func() map[string]interface{} { return store.Store.PVs })
	HandleStorageClasses = MakeHandler(func() map[string]interface{} { return store.Store.StorageClasses })

	// Cluster & RBAC
	HandleNamespaces          = MakeHandler(func() map[string]interface{} { return store.Store.Namespaces })
	HandleCRDs                = MakeHandler(func() map[string]interface{} { return store.Store.CRDs })
	HandleServiceAccounts     = MakeHandler(func() map[string]interface{} { return store.Store.ServiceAccounts })
	HandleRoles               = MakeHandler(func() map[string]interface{} { return store.Store.Roles })
	HandleClusterRoles        = MakeHandler(func() map[string]interface{} { return store.Store.ClusterRoles })
	HandleRoleBindings        = MakeHandler(func() map[string]interface{} { return store.Store.RoleBindings })
	HandleClusterRoleBindings = MakeHandler(func() map[string]interface{} { return store.Store.ClusterRoleBindings })
	HandleEvents              = MakeHandler(func() map[string]interface{} { return store.Store.Events })
)

func HandleHelmList(w http.ResponseWriter, r *http.Request) {
	kubeconfig := r.URL.Query().Get("kubeconfig")
	context := r.URL.Query().Get("context")
	namespace := r.URL.Query().Get("namespace")

	releases, err := helm.ListReleases(kubeconfig, context, namespace)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(releases)
}

func HandleHelmStatus(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")

	status, err := helm.GetReleaseStatus(namespace, release)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write([]byte(status))
}

func HandleHelmValues(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")
	all := r.URL.Query().Get("all") == "true"

	values, err := helm.GetReleaseValues(namespace, release, all)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/yaml")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write([]byte(values))
}

func HandleHelmHistory(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	release := r.URL.Query().Get("release")

	history, err := helm.GetReleaseHistory(namespace, release)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(history)
}

func HandleLogs(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	pod := r.URL.Query().Get("pod")
	namespace := r.URL.Query().Get("namespace")
	container := r.URL.Query().Get("container")
	tailStr := r.URL.Query().Get("tail")
	tail := int64(200)
	if tailStr != "" {
		if t, err := strconv.ParseInt(tailStr, 10, 64); err == nil {
			tail = t
		}
	}

	if pod == "" || namespace == "" {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: pod and namespace are required"))
		return
	}

	stream, err := logs.StreamLogs(store.Store.Clientset, r.Context(), namespace, pod, container, tail, true)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
		return
	}

	err = logs.CopyStream(stream, func(line []byte) error {
		return conn.WriteMessage(websocket.TextMessage, line)
	})

	if err != nil {
		log.Printf("Log streaming ended with error: %v", err)
	}
}

func HandlePortForward(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	localPortStr := r.URL.Query().Get("localPort")
	remotePortStr := r.URL.Query().Get("remotePort")

	localPort, _ := strconv.Atoi(localPortStr)
	remotePort, _ := strconv.Atoi(remotePortStr)

	if id == "" || namespace == "" || pod == "" || localPort == 0 || remotePort == 0 {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	err := portforward.Manager.StartForward(id, namespace, pod, localPort, remotePort)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleStopPortForward(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id parameter", http.StatusBadRequest)
		return
	}

	portforward.Manager.StopForward(id)
	w.WriteHeader(http.StatusOK)
}

func HandleScale(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind") // deployment, statefulset
	name := r.URL.Query().Get("name")
	replicasStr := r.URL.Query().Get("replicas")
	replicas, _ := strconv.Atoi(replicasStr)

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	err := retry.RetryOnConflict(retry.DefaultRetry, func() error {
		switch kind {
		case "deployment":
			deploy, err := store.Store.Clientset.AppsV1().Deployments(namespace).Get(r.Context(), name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			rep := int32(replicas)
			deploy.Spec.Replicas = &rep
			_, err = store.Store.Clientset.AppsV1().Deployments(namespace).Update(r.Context(), deploy, metav1.UpdateOptions{})
			return err
		case "statefulset":
			sts, err := store.Store.Clientset.AppsV1().StatefulSets(namespace).Get(r.Context(), name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			rep := int32(replicas)
			sts.Spec.Replicas = &rep
			_, err = store.Store.Clientset.AppsV1().StatefulSets(namespace).Update(r.Context(), sts, metav1.UpdateOptions{})
			return err
		default:
			return fmt.Errorf("unsupported kind for scale: %s", kind)
		}
	})

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleDelete(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	var err error
	switch kind {
	case "pod":
		err = store.Store.Clientset.CoreV1().Pods(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "deployment":
		err = store.Store.Clientset.AppsV1().Deployments(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "service":
		err = store.Store.Clientset.CoreV1().Services(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "configmap":
		err = store.Store.Clientset.CoreV1().ConfigMaps(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "secret":
		err = store.Store.Clientset.CoreV1().Secrets(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "ingress":
		err = store.Store.Clientset.NetworkingV1().Ingresses(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "statefulset":
		err = store.Store.Clientset.AppsV1().StatefulSets(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "daemonset":
		err = store.Store.Clientset.AppsV1().DaemonSets(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "job":
		err = store.Store.Clientset.BatchV1().Jobs(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "cronjob":
		err = store.Store.Clientset.BatchV1().CronJobs(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "pvc":
		err = store.Store.Clientset.CoreV1().PersistentVolumeClaims(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	case "pv":
		err = store.Store.Clientset.CoreV1().PersistentVolumes().Delete(r.Context(), name, metav1.DeleteOptions{})
	case "node":
		err = store.Store.Clientset.CoreV1().Nodes().Delete(r.Context(), name, metav1.DeleteOptions{})
	default:
		err = fmt.Errorf("unsupported kind for delete: %s", kind)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleRolloutRestart(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	data := fmt.Sprintf(`{"spec": {"template": {"metadata": {"annotations": {"kubectl.kubernetes.io/restartedAt": "%s"}}}}}`, time.Now().Format(time.RFC3339))
	var err error
	switch kind {
	case "deployment":
		_, err = store.Store.Clientset.AppsV1().Deployments(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	case "daemonset":
		_, err = store.Store.Clientset.AppsV1().DaemonSets(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	case "statefulset":
		_, err = store.Store.Clientset.AppsV1().StatefulSets(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	default:
		err = fmt.Errorf("unsupported kind for rollout restart: %s", kind)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleGetYAML(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	var obj interface{}
	var err error
	switch kind {
	case "pod":
		obj, err = store.Store.Clientset.CoreV1().Pods(namespace).Get(r.Context(), name, metav1.GetOptions{})
	case "deployment":
		obj, err = store.Store.Clientset.AppsV1().Deployments(namespace).Get(r.Context(), name, metav1.GetOptions{})
	case "service":
		obj, err = store.Store.Clientset.CoreV1().Services(namespace).Get(r.Context(), name, metav1.GetOptions{})
	case "configmap":
		obj, err = store.Store.Clientset.CoreV1().ConfigMaps(namespace).Get(r.Context(), name, metav1.GetOptions{})
	case "secret":
		obj, err = store.Store.Clientset.CoreV1().Secrets(namespace).Get(r.Context(), name, metav1.GetOptions{})
	case "ingress":
		obj, err = store.Store.Clientset.NetworkingV1().Ingresses(namespace).Get(r.Context(), name, metav1.GetOptions{})
	case "node":
		obj, err = store.Store.Clientset.CoreV1().Nodes().Get(r.Context(), name, metav1.GetOptions{})
	default:
		err = fmt.Errorf("unsupported kind for get yaml: %s", kind)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	y, err := yaml.Marshal(obj)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/yaml")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(y)
}

func HandleApplyYAML(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 1. Decode YAML to Unstructured
	obj := &unstructured.Unstructured{}
	if err := yaml.Unmarshal(body, obj); err != nil {
		http.Error(w, "Invalid YAML: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 2. Setup dynamic and discovery clients
	dc, err := discovery.NewDiscoveryClientForConfig(store.Store.Config)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	dyn, err := dynamic.NewForConfig(store.Store.Config)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Find GVR
	gr, err := restmapper.GetAPIGroupResources(dc)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	mapper := restmapper.NewDiscoveryRESTMapper(gr)
	gvk := obj.GroupVersionKind()
	mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 4. Apply (use Server-Side Apply if supported, otherwise just Create/Update)
	// For simplicity, we'll use Patch with ApplyPatchType
	namespace := obj.GetNamespace()
	name := obj.GetName()

	var resource dynamic.ResourceInterface
	if mapping.Scope.Name() == "namespace" {
		resource = dyn.Resource(mapping.Resource).Namespace(namespace)
	} else {
		resource = dyn.Resource(mapping.Resource)
	}

	_, err = resource.Patch(r.Context(), name, types.ApplyPatchType, body, metav1.PatchOptions{
		FieldManager: "podscape-sidecar",
	})

	if err != nil {
		http.Error(w, "Apply failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleGetSecretValue(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	key := r.URL.Query().Get("key")

	if namespace == "" || name == "" || key == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	secret, err := store.Store.Clientset.CoreV1().Secrets(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	val, ok := secret.Data[key]
	if !ok {
		http.Error(w, fmt.Sprintf("key %s not found in secret %s", key, name), http.StatusNotFound)
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write(val)
}

func HandleExecOneShot(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	command := r.URL.Query()["command"]

	if pod == "" || namespace == "" || len(command) == 0 {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	// Capture output
	out := &captureWriter{}
	errOut := &captureWriter{}

	err := exec.Exec(store.Store.Clientset, store.Store.Config, namespace, pod, container, command, nil, out, errOut, false)
	
	resp := map[string]interface{}{
		"stdout": out.String(),
		"stderr": errOut.String(),
	}
	if err != nil {
		resp["error"] = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(resp)
}

func HandleExec(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	pod := r.URL.Query().Get("pod")
	namespace := r.URL.Query().Get("namespace")
	container := r.URL.Query().Get("container")
	command := r.URL.Query()["command"]
	if len(command) == 0 {
		command = []string{"/bin/sh"}
	}

	if pod == "" || namespace == "" {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: pod and namespace are required"))
		return
	}

	stream := &wsStream{conn: conn}
	err = exec.Exec(store.Store.Clientset, store.Store.Config, namespace, pod, container, command, stream, stream, stream, true)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\nExec failed: "+err.Error()))
	}
}

func HandleCPFrom(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	srcPath := r.URL.Query().Get("path")

	if pod == "" || namespace == "" || srcPath == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/x-tar")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	command := []string{"tar", "cf", "-", srcPath}
	err := exec.Exec(store.Store.Clientset, store.Store.Config, namespace, pod, container, command, nil, w, w, false)
	if err != nil {
		log.Printf("CP FROM failed: %v", err)
	}
}

func HandleCPTo(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	destPath := r.URL.Query().Get("path")

	if pod == "" || namespace == "" || destPath == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	command := []string{"tar", "xf", "-", "-C", destPath}
	err := exec.Exec(store.Store.Clientset, store.Store.Config, namespace, pod, container, command, r.Body, w, w, false)
	if err != nil {
		http.Error(w, "CP TO failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleGetContexts(w http.ResponseWriter, r *http.Request) {
	config, err := clientcmd.LoadFromFile(store.Store.Kubeconfig)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(config.Contexts)
}

func HandleGetCurrentContext(w http.ResponseWriter, r *http.Request) {
	config, err := clientcmd.LoadFromFile(store.Store.Kubeconfig)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write([]byte(config.CurrentContext))
}

func HandleSwitchContext(w http.ResponseWriter, r *http.Request) {
	contextName := r.URL.Query().Get("context")
	if contextName == "" {
		http.Error(w, "missing context parameter", http.StatusBadRequest)
		return
	}

	config, err := clientcmd.LoadFromFile(store.Store.Kubeconfig)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if _, ok := config.Contexts[contextName]; !ok {
		http.Error(w, "context not found", http.StatusNotFound)
		return
	}

	config.CurrentContext = contextName
	err = clientcmd.WriteToFile(*config, store.Store.Kubeconfig)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func HandleHelmRollback(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	releaseName := r.URL.Query().Get("release")
	revisionStr := r.URL.Query().Get("revision")
	revision, _ := strconv.Atoi(revisionStr)

	if namespace == "" || releaseName == "" || revision == 0 {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	err := helm.RollbackRelease(namespace, releaseName, revision)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleGetPodMetrics(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	path := "/apis/metrics.k8s.io/v1beta1/pods"
	if ns != "" {
		path = "/apis/metrics.k8s.io/v1beta1/namespaces/" + ns + "/pods"
	}
	data, err := store.Store.Clientset.RESTClient().Get().AbsPath(path).DoRaw(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func HandleGetNodeMetrics(w http.ResponseWriter, r *http.Request) {
	data, err := store.Store.Clientset.RESTClient().Get().AbsPath("/apis/metrics.k8s.io/v1beta1/nodes").DoRaw(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func HandleCreateDebugPod(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	image := r.URL.Query().Get("image")
	name := r.URL.Query().Get("name")

	if ns == "" || image == "" || name == "" {
		http.Error(w, "namespace, image, and name are required", http.StatusBadRequest)
		return
	}

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			Labels:    map[string]string{"created-by": "podscape"},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:    "debug",
					Image:   image,
					Command: []string{"sleep", "infinity"},
				},
			},
			RestartPolicy: corev1.RestartPolicyNever,
		},
	}

	_, err := store.Store.Clientset.CoreV1().Pods(ns).Create(r.Context(), pod, metav1.CreateOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func HandleHelmUninstall(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	releaseName := r.URL.Query().Get("release")

	if namespace == "" || releaseName == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	_, err := helm.UninstallRelease(namespace, releaseName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleRolloutHistory(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	// Basic implementation: List ReplicaSets for Deployments or ControllerRevisions for StatefulSets
	var history interface{}
	var err error
	switch kind {
	case "deployment":
		list, e := store.Store.Clientset.AppsV1().ReplicaSets(namespace).List(r.Context(), metav1.ListOptions{
			LabelSelector: fmt.Sprintf("app=%s", name), // This is a simplification
		})
		history = list
		err = e
	case "statefulset":
		list, e := store.Store.Clientset.AppsV1().ControllerRevisions(namespace).List(r.Context(), metav1.ListOptions{
			LabelSelector: fmt.Sprintf("app=%s", name), // Simplification
		})
		history = list
		err = e
	default:
		err = fmt.Errorf("unsupported kind for rollout history: %s", kind)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(history)
}

func HandleRolloutUndo(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	revisionStr := r.URL.Query().Get("revision")
	revision, _ := strconv.Atoi(revisionStr)

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	// Implementation using rollback logic
	// For simplicity, we'll use the k8s logic for rollout undo
	// This usually involves finding the target revision and patching the resource
	// I'll implement a basic version that sets the revision annotation if provided,
	// or triggers a standard rollback.
	
	// Since full undo logic is complex to re-implement without kubectl codebase,
	// we'll return a 501 if we can't find a clean way, or try to use SSA.
	// Actually, let's just return success for the API for now or implement a basic patch.
	log.Printf("[Rollout] Undo requested for %s/%s in %s (rev: %d)", kind, name, namespace, revision)
	
	// TODO: Full implementation of Rollout Undo logic.
	// For now, let's at least acknowledge and log it.
	http.Error(w, "Rollout undo logic is pending full implementation", http.StatusNotImplemented)
}

type wsStream struct {
	conn *websocket.Conn
}

func (s *wsStream) Read(p []byte) (n int, err error) {
	_, message, err := s.conn.ReadMessage()
	if err != nil {
		return 0, err
	}
	copy(p, message)
	return len(message), nil
}

func (s *wsStream) Write(p []byte) (n int, err error) {
	err = s.conn.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

type captureWriter struct {
	data []byte
}

func (w *captureWriter) Write(p []byte) (n int, err error) {
	w.data = append(w.data, p...)
	return len(p), nil
}

func (w *captureWriter) String() string {
	return string(w.data)
}

func HandleTopology(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	topo := topology.BuildTopology(ns)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(topo)
}
