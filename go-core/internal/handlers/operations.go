package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/util/retry"
	"sigs.k8s.io/yaml"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/exec"
	"github.com/podscape/go-core/internal/store"
)

func HandleScale(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind") // deployment, statefulset
	name := r.URL.Query().Get("name")
	replicasStr := r.URL.Query().Get("replicas")
	replicas, err := strconv.Atoi(replicasStr)
	if err != nil || replicasStr == "" || replicas < 0 || replicas > math.MaxInt32 {
		http.Error(w, "invalid replicas: must be a non-negative integer not exceeding 2147483647", http.StatusBadRequest)
		return
	}

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	err = retry.RetryOnConflict(retry.DefaultRetry, func() error {
		switch kind {
		case "deployment":
			deploy, err := cs.AppsV1().Deployments(namespace).Get(r.Context(), name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			rep := int32(replicas)
			deploy.Spec.Replicas = &rep
			_, err = cs.AppsV1().Deployments(namespace).Update(r.Context(), deploy, metav1.UpdateOptions{})
			return err
		case "statefulset":
			sts, err := cs.AppsV1().StatefulSets(namespace).Get(r.Context(), name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			rep := int32(replicas)
			sts.Spec.Replicas = &rep
			_, err = cs.AppsV1().StatefulSets(namespace).Update(r.Context(), sts, metav1.UpdateOptions{})
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

	gvr, ok := kindGVR[kind]
	if !ok {
		http.Error(w, fmt.Sprintf("unsupported kind: %s", kind), http.StatusBadRequest)
		return
	}

	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if clusterScopedKinds[kind] {
		err = dynClient.Resource(gvr).Delete(r.Context(), name, metav1.DeleteOptions{})
	} else {
		err = dynClient.Resource(gvr).Namespace(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	}

	if err != nil {
		if errors.IsNotFound(err) {
			w.WriteHeader(http.StatusOK)
			return
		}
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

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	data := fmt.Sprintf(`{"spec": {"template": {"metadata": {"annotations": {"kubectl.kubernetes.io/restartedAt": "%s"}}}}}`, time.Now().Format(time.RFC3339))
	var err error
	switch kind {
	case "deployment":
		_, err = cs.AppsV1().Deployments(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	case "daemonset":
		_, err = cs.AppsV1().DaemonSets(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
	case "statefulset":
		_, err = cs.AppsV1().StatefulSets(namespace).Patch(r.Context(), name, types.StrategicMergePatchType, []byte(data), metav1.PatchOptions{})
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

	gvr, ok := kindGVR[kind]
	if !ok {
		// Fall back to treating kind as "<resource>.<group>" for custom resources
		// (e.g. "virtualservices.networking.istio.io" — the format CRDDetail uses
		// when fetching YAML for CRD instances).
		dot := strings.Index(kind, ".")
		if dot <= 0 {
			http.Error(w, fmt.Sprintf("unsupported kind: %s", kind), http.StatusBadRequest)
			return
		}
		resource, group := kind[:dot], kind[dot+1:]

		cs, cfg := store.Store.ActiveClientset()
		if cfg == nil {
			http.Error(w, "no active context", http.StatusServiceUnavailable)
			return
		}
		version, err := preferredGroupVersion(cs, group)
		if err != nil {
			http.Error(w, fmt.Sprintf("unknown API group %q: %v", group, err), http.StatusBadRequest)
			return
		}

		dynClient, err := dynClientFactory(cfg)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		crdGVR := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
		var obj *unstructured.Unstructured
		if namespace != "" {
			obj, err = dynClient.Resource(crdGVR).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
		} else {
			obj, err = dynClient.Resource(crdGVR).Get(r.Context(), name, metav1.GetOptions{})
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		y, err := yaml.Marshal(obj.Object)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/yaml")
		w.Write(y)
		return
	}

	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var obj *unstructured.Unstructured
	if clusterScopedKinds[kind] {
		obj, err = dynClient.Resource(gvr).Get(r.Context(), name, metav1.GetOptions{})
	} else {
		obj, err = dynClient.Resource(gvr).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	y, err := yaml.Marshal(obj.Object)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/yaml")
	w.Write(y)
}

func HandleApplyYAML(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10 MB limit
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "request body too large or unreadable", http.StatusRequestEntityTooLarge)
		return
	}

	// 1. Decode YAML to Unstructured
	obj := &unstructured.Unstructured{}
	if err := yaml.Unmarshal(body, obj); err != nil {
		http.Error(w, "Invalid YAML: "+err.Error(), http.StatusBadRequest)
		return
	}

	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// 2. Setup dynamic and discovery clients
	dc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	dyn, err := dynamic.NewForConfig(cfg)
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

	// 4. Apply using Server-Side Apply
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

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	secret, err := cs.CoreV1().Secrets(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	val, ok := secret.Data[key]
	if !ok {
		http.Error(w, fmt.Sprintf("key %s not found in secret %s", key, name), http.StatusNotFound)
		return
	}

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

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// Capture output
	out := &captureWriter{}
	errOut := &captureWriter{}

	err := exec.Exec(r.Context(), cs, cfg, namespace, pod, container, command, nil, out, errOut, false)

	resp := map[string]interface{}{
		"stdout": out.String(),
		"stderr": errOut.String(),
	}
	if err != nil {
		resp["error"] = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
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

	log.Printf("[HandleExec] Starting interactive session for %s/%s/%s", namespace, pod, container)

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error: no active context"))
		return
	}

	stream := &wsStream{conn: conn}
	err = exec.Exec(r.Context(), cs, cfg, namespace, pod, container, command, stream, stream, stream, true)
	if err != nil {
		log.Printf("[HandleExec] Session ended with error for %s/%s: %v", namespace, pod, err)
		conn.WriteMessage(websocket.TextMessage, []byte("\r\nExec failed: "+err.Error()))
	} else {
		log.Printf("[HandleExec] Session ended normally for %s/%s", namespace, pod)
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

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// Stream raw file bytes from the container using cat.
	// The client writes them directly to disk — no tar needed for download.
	content := &bytes.Buffer{}
	stderrBuf := &captureWriter{}
	catErr := exec.Exec(r.Context(), cs, cfg, namespace, pod, container,
		[]string{"cat", srcPath}, nil, content, stderrBuf, false)
	if catErr != nil {
		http.Error(w, "failed to read file from container: "+catErr.Error(), http.StatusInternalServerError)
		log.Printf("CP FROM cat failed for %s/%s %s: %v (stderr: %s)", namespace, pod, srcPath, catErr, stderrBuf.String())
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(content.Bytes())
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

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// The client packs the file as a tar with just the basename as the entry name.
	// Extract to the parent directory of destPath so the file lands at destPath.
	// stdout/stderr go to a buffer — writing them to w would trigger "superfluous WriteHeader".
	destDir := path.Dir(destPath)
	outBuf := &captureWriter{}
	command := []string{"tar", "xf", "-", "-C", destDir}
	err := exec.Exec(r.Context(), cs, cfg, namespace, pod, container, command, r.Body, outBuf, outBuf, false)
	if err != nil {
		http.Error(w, "CP TO failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func HandleCreateDebugPod(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	image := r.URL.Query().Get("image")
	name := r.URL.Query().Get("name")

	if ns == "" || image == "" || name == "" {
		http.Error(w, "namespace, image, and name are required", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
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

	_, err := cs.CoreV1().Pods(ns).Create(r.Context(), pod, metav1.CreateOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func HandleRolloutHistory(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// Basic implementation: List ReplicaSets for Deployments or ControllerRevisions for StatefulSets
	var history interface{}
	var err error
	switch kind {
	case "deployment":
		list, e := cs.AppsV1().ReplicaSets(namespace).List(r.Context(), metav1.ListOptions{
			LabelSelector: fmt.Sprintf("app=%s", name), // This is a simplification
		})
		history = list
		err = e
	case "statefulset":
		list, e := cs.AppsV1().ControllerRevisions(namespace).List(r.Context(), metav1.ListOptions{
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
	json.NewEncoder(w).Encode(history)
}

func HandleRolloutUndo(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	revisionStr := r.URL.Query().Get("revision")
	var targetRevision int64
	if revisionStr != "" {
		var parseErr error
		targetRevision, parseErr = strconv.ParseInt(revisionStr, 10, 64)
		if parseErr != nil || targetRevision < 0 {
			http.Error(w, "invalid revision: must be a non-negative integer", http.StatusBadRequest)
			return
		}
	}

	if namespace == "" || name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	var err error
	switch kind {
	case "deployment":
		err = undoDeploymentRollout(r.Context(), namespace, name, targetRevision)
	default:
		http.Error(w, fmt.Sprintf("rollout undo not supported for kind: %s", kind), http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// parseRevision reads the "deployment.kubernetes.io/revision" annotation and
// returns (revision, true) on success, or (0, false) if the annotation is
// absent or non-numeric. Centralises the repeated strconv.ParseInt call so
// callers can distinguish a missing annotation from an explicit revision 0.
func parseRevision(ann map[string]string) (int64, bool) {
	s, ok := ann["deployment.kubernetes.io/revision"]
	if !ok || s == "" {
		return 0, false
	}
	v, err := strconv.ParseInt(s, 10, 64)
	return v, err == nil
}

// undoDeploymentRollout reverts a Deployment to a previous revision by finding
// the matching ReplicaSet and patching the Deployment's pod template to match.
// If targetRevision is 0, it uses the second-most-recent revision (standard "undo").
func undoDeploymentRollout(ctx context.Context, namespace, name string, targetRevision int64) error {
	clientset, _ := store.Store.ActiveClientset()
	if clientset == nil {
		return fmt.Errorf("no active context")
	}

	deploy, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get deployment: %w", err)
	}
	currentRevision, hasRevision := parseRevision(deploy.Annotations)
	if !hasRevision {
		return fmt.Errorf("deployment %s has no revision annotation; rollout history not available", name)
	}

	// List ReplicaSets matching this deployment's selector.
	selector, err := metav1.LabelSelectorAsSelector(deploy.Spec.Selector)
	if err != nil {
		return fmt.Errorf("failed to build label selector: %w", err)
	}
	rsList, err := clientset.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selector.String(),
	})
	if err != nil {
		return fmt.Errorf("failed to list replicasets: %w", err)
	}

	// Keep only ReplicaSets owned by this deployment.
	owned := make([]appsv1.ReplicaSet, 0, len(rsList.Items))
	for _, rs := range rsList.Items {
		for _, ref := range rs.OwnerReferences {
			if ref.Kind == "Deployment" && ref.Name == name {
				owned = append(owned, rs)
				break
			}
		}
	}
	if len(owned) == 0 {
		return fmt.Errorf("no replicasets found for deployment %s", name)
	}

	// Find the target ReplicaSet by revision annotation.
	var targetRS *appsv1.ReplicaSet
	if targetRevision == 0 {
		// Find the highest revision that is NOT the current one.
		var bestRev int64
		for i := range owned {
			if rev, ok := parseRevision(owned[i].Annotations); ok && rev != currentRevision && rev > bestRev {
				bestRev = rev
				targetRS = &owned[i]
			}
		}
	} else {
		for i := range owned {
			if rev, ok := parseRevision(owned[i].Annotations); ok && rev == targetRevision {
				targetRS = &owned[i]
				break
			}
		}
	}
	if targetRS == nil {
		return fmt.Errorf("target revision not found (requested %d, current %d)", targetRevision, currentRevision)
	}

	// Patch the deployment's pod template to match the target ReplicaSet.
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		current, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return err
		}
		current.Spec.Template = targetRS.Spec.Template
		_, err = clientset.AppsV1().Deployments(namespace).Update(ctx, current, metav1.UpdateOptions{})
		return err
	})
}

// HandleCordonNode cordons (unschedulable=true) or uncordons (unschedulable=false) a node.
// Query params: name (required), unschedulable (true|false, default true)
func HandleCordonNode(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "missing name", http.StatusBadRequest)
		return
	}
	unschedulable := r.URL.Query().Get("unschedulable") != "false"

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	patch := []byte(fmt.Sprintf(`{"spec":{"unschedulable":%v}}`, unschedulable))
	if _, err := cs.CoreV1().Nodes().Patch(r.Context(), name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// HandleDrainNode cordons the node then deletes all evictable pods (skips DaemonSet-owned and mirror pods).
func HandleDrainNode(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "missing name", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	// 1. Cordon the node first.
	cordonPatch := []byte(`{"spec":{"unschedulable":true}}`)
	if _, err := cs.CoreV1().Nodes().Patch(r.Context(), name, types.MergePatchType, cordonPatch, metav1.PatchOptions{}); err != nil {
		http.Error(w, "cordon failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 2. List all pods scheduled on this node.
	pods, err := cs.CoreV1().Pods("").List(r.Context(), metav1.ListOptions{
		FieldSelector: fmt.Sprintf("spec.nodeName=%s", name),
	})
	if err != nil {
		http.Error(w, "list pods failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Delete evictable pods (skip DaemonSet-owned and mirror/static pods).
	var errs []string
	for _, pod := range pods.Items {
		isDaemonSet := false
		for _, ref := range pod.OwnerReferences {
			if ref.Kind == "DaemonSet" {
				isDaemonSet = true
				break
			}
		}
		if isDaemonSet {
			continue
		}
		if _, isMirror := pod.Annotations["kubernetes.io/config.mirror"]; isMirror {
			continue
		}
		if delErr := cs.CoreV1().Pods(pod.Namespace).Delete(r.Context(), pod.Name, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
			errs = append(errs, fmt.Sprintf("%s/%s: %v", pod.Namespace, pod.Name, delErr))
		}
	}

	if len(errs) > 0 {
		http.Error(w, "drain partial failure: "+strings.Join(errs, "; "), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// HandleTriggerCronJob creates a Job on-demand from a CronJob's template
// (equivalent to `kubectl create job --from=cronjob/<name>`).
// Query params: namespace (required), name (required).
func HandleTriggerCronJob(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	if namespace == "" || name == "" {
		http.Error(w, "namespace and name are required", http.StatusBadRequest)
		return
	}

	cs, _ := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	cj, err := cs.BatchV1().CronJobs(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	trueVal := true
	jobName := fmt.Sprintf("%s-manual-%d", name, time.Now().Unix())
	// Truncate so the total stays within the 63-char DNS label limit.
	if len(jobName) > 63 {
		jobName = jobName[:63]
	}

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: namespace,
			Annotations: map[string]string{
				"cronjob.kubernetes.io/instantiate": "manual",
			},
			OwnerReferences: []metav1.OwnerReference{
				{
					APIVersion:         "batch/v1",
					Kind:               "CronJob",
					Name:               cj.Name,
					UID:                cj.UID,
					BlockOwnerDeletion: &trueVal,
					Controller:         &trueVal,
				},
			},
		},
		Spec: cj.Spec.JobTemplate.Spec,
	}

	created, err := cs.BatchV1().Jobs(namespace).Create(r.Context(), job, metav1.CreateOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"name": created.Name})
}
