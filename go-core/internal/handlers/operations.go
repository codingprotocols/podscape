package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
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
	"github.com/podscape/go-core/internal/k8sutil"
	"github.com/podscape/go-core/internal/ops"
	"github.com/podscape/go-core/internal/store"


	"k8s.io/client-go/kubernetes"
)

func HandleScale(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind") // deployment, statefulset
	name := r.URL.Query().Get("name")
	replicasStr := r.URL.Query().Get("replicas")
	replicasI64, err := strconv.ParseInt(replicasStr, 10, 32)
	if err != nil || replicasStr == "" || replicasI64 < 0 {
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
			rep := int32(replicasI64)
			deploy.Spec.Replicas = &rep
			_, err = cs.AppsV1().Deployments(namespace).Update(r.Context(), deploy, metav1.UpdateOptions{})
			return err
		case "statefulset":
			sts, err := cs.AppsV1().StatefulSets(namespace).Get(r.Context(), name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			rep := int32(replicasI64)
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

// dynDelete deletes a resource via the dynamic client, retrying with the
// k8sutil fallback GVR on NotFound (which may mean the primary API version is
// not registered on the server, e.g. autoscaling/v2 on pre-1.23 clusters).
func dynDelete(ctx context.Context, client dynamic.Interface, kind, namespace, name string, gvr schema.GroupVersionResource) error {
	do := func(g schema.GroupVersionResource) error {
		if k8sutil.ClusterScopedKinds[kind] {
			return client.Resource(g).Delete(ctx, name, metav1.DeleteOptions{})
		}
		return client.Resource(g).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	}
	err := do(gvr)
	if errors.IsNotFound(err) {
		if fallback, ok := k8sutil.KindGVRFallback[kind]; ok {
			err = do(fallback)
		}
	}
	return err
}

// dynGet fetches a resource via the dynamic client, retrying with the
// k8sutil fallback GVR on NotFound (same version-skew rationale as dynDelete).
func dynGet(ctx context.Context, client dynamic.Interface, kind, namespace, name string, gvr schema.GroupVersionResource) (*unstructured.Unstructured, error) {
	do := func(g schema.GroupVersionResource) (*unstructured.Unstructured, error) {
		if k8sutil.ClusterScopedKinds[kind] {
			return client.Resource(g).Get(ctx, name, metav1.GetOptions{})
		}
		return client.Resource(g).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	}
	obj, err := do(gvr)
	if errors.IsNotFound(err) {
		if fallback, ok := k8sutil.KindGVRFallback[kind]; ok {
			obj, err = do(fallback)
		}
	}
	return obj, err
}

func HandleDelete(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")

	if name == "" || kind == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	gvr, ok := k8sutil.KindGVR[kind]

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

	err = dynDelete(r.Context(), dynClient, kind, namespace, name, gvr)
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

	gvr, ok := k8sutil.KindGVR[kind]

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

	obj, err := dynGet(r.Context(), dynClient, kind, namespace, name, gvr)
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

// splitYAMLDocs splits a YAML byte slice on document separators ("---") and
// returns only non-empty documents.
func splitYAMLDocs(data []byte) [][]byte {
	var docs [][]byte
	for _, part := range strings.Split(string(data), "\n---") {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" && trimmed != "---" {
			docs = append(docs, []byte(trimmed))
		}
	}
	return docs
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

	// Validate and split the YAML body before touching the cluster — this
	// preserves the 400 Bad Request response for invalid/empty payloads even
	// when no cluster is connected (which would otherwise return 503 first).
	docs := splitYAMLDocs(body)
	if len(docs) == 0 {
		http.Error(w, "empty YAML body", http.StatusBadRequest)
		return
	}
	for _, doc := range docs {
		if unmarshalErr := yaml.Unmarshal(doc, &unstructured.Unstructured{}); unmarshalErr != nil {
			http.Error(w, "invalid YAML: "+unmarshalErr.Error(), http.StatusBadRequest)
			return
		}
	}

	_, cfg := store.Store.ActiveClientset()
	if cfg == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

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

	gr, err := restmapper.GetAPIGroupResources(dc)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	mapper := restmapper.NewDiscoveryRESTMapper(gr)

	var applyErrs []string
	for _, doc := range docs {
		obj := &unstructured.Unstructured{}
		if unmarshalErr := yaml.Unmarshal(doc, obj); unmarshalErr != nil {
			applyErrs = append(applyErrs, "invalid YAML: "+unmarshalErr.Error())
			continue
		}
		gvk := obj.GroupVersionKind()
		if gvk.Kind == "" {
			applyErrs = append(applyErrs, "document has no 'kind' field")
			continue
		}
		mapping, mapErr := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if mapErr != nil {
			applyErrs = append(applyErrs, mapErr.Error())
			continue
		}

		// Strip server-managed fields before applying.
		obj.SetManagedFields(nil)
		delete(obj.Object, "status")
		if metadata, ok := obj.Object["metadata"].(map[string]any); ok {
			delete(metadata, "uid")
			delete(metadata, "resourceVersion")
			delete(metadata, "creationTimestamp")
			delete(metadata, "generation")
		}
		patchBytes, marshalErr := json.Marshal(obj.Object)
		if marshalErr != nil {
			applyErrs = append(applyErrs, "failed to marshal manifest: "+marshalErr.Error())
			continue
		}

		namespace := obj.GetNamespace()
		name := obj.GetName()
		var resource dynamic.ResourceInterface
		if mapping.Scope.Name() == "namespace" {
			resource = dyn.Resource(mapping.Resource).Namespace(namespace)
		} else {
			resource = dyn.Resource(mapping.Resource)
		}

		force := true
		_, patchErr := resource.Patch(r.Context(), name, types.ApplyPatchType, patchBytes, metav1.PatchOptions{
			FieldManager: "podscape-sidecar",
			Force:        &force,
		})
		if patchErr != nil {
			msg := patchErr.Error()
			if strings.Contains(msg, "pod updates may not change fields") {
				msg = "Pod spec fields are immutable after creation. Edit the parent Deployment or StatefulSet instead."
			}
			applyErrs = append(applyErrs, msg)
		}
	}

	if len(applyErrs) > 0 {
		http.Error(w, "Apply failed: "+strings.Join(applyErrs, "; "), http.StatusInternalServerError)
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

	resp := map[string]any{
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

	// Pre-flight check: verify the file is accessible before committing to a
	// 200 response. Without this, a missing or unreadable file causes us to
	// send 200 with an empty body — the Node client sees a zero-byte file
	// with no error.
	checkBuf := &captureWriter{}
	checkErr := exec.Exec(r.Context(), cs, cfg, namespace, pod, container,
		[]string{"test", "-f", srcPath}, nil, nil, checkBuf, false)
	if checkErr != nil {
		http.Error(w, fmt.Sprintf("file not found or not readable in container: %s", srcPath), http.StatusNotFound)
		return
	}

	// Stream raw bytes directly from the container to the HTTP response.
	// Headers are committed here — any mid-stream error closes the connection
	// and the Node client surfaces it as a network error.
	w.Header().Set("Content-Type", "application/octet-stream")
	stderrBuf := &captureWriter{}
	if err := exec.Exec(r.Context(), cs, cfg, namespace, pod, container,
		[]string{"cat", srcPath}, nil, w, stderrBuf, false); err != nil {
		log.Printf("CP FROM cat failed for %s/%s %s: %v (stderr: %s)", namespace, pod, srcPath, err, stderrBuf.String())
	}
}

func HandleCPTo(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	destPath := r.URL.Query().Get("path")
	localPath := r.URL.Query().Get("localPath")

	if pod == "" || namespace == "" || destPath == "" || localPath == "" {
		http.Error(w, "missing required parameters", http.StatusBadRequest)
		return
	}

	cs, cfg := store.Store.ActiveClientset()
	if cs == nil {
		http.Error(w, "no active context", http.StatusServiceUnavailable)
		return
	}

	safeLocalPath, err := sanitizeCPToLocalPath(localPath)
	if err != nil {
		http.Error(w, "invalid localPath: "+err.Error(), http.StatusBadRequest)
		return
	}

	f, err := os.Open(safeLocalPath)
	if err != nil {
		http.Error(w, "failed to open local file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()

	// Pipe raw bytes directly using "cat >" — no tar dependency required in the container.
	// mkdir -p ensures the parent directory exists. shellQuote wraps each path component
	// in single quotes and escapes any embedded single quotes so paths like "user's dir"
	// or adversarial inputs cannot break out of the shell quoting context.
	shellQuote := func(s string) string {
		return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
	}
	destDir := path.Dir(destPath)
	command := []string{"sh", "-c", fmt.Sprintf("mkdir -p %s && cat > %s", shellQuote(destDir), shellQuote(destPath))}
	outBuf := &captureWriter{}
	if err := exec.Exec(r.Context(), cs, cfg, namespace, pod, container, command, f, outBuf, outBuf, false); err != nil {
		http.Error(w, "CP TO failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func sanitizeCPToLocalPath(localPath string) (string, error) {
	if strings.TrimSpace(localPath) == "" {
		return "", fmt.Errorf("path is empty")
	}

	// Resolve to an absolute path. Absolute paths (returned by the native file
	// dialog) are used directly; relative paths are resolved against CWD.
	absInput, err := filepath.Abs(filepath.Clean(localPath))
	if err != nil {
		return "", fmt.Errorf("cannot resolve path: %w", err)
	}

	// Dereference symlinks so the allowed-root comparison is reliable.
	candidate, err := filepath.EvalSymlinks(absInput)
	if err != nil {
		return "", fmt.Errorf("cannot access file: %w", err)
	}

	info, err := os.Stat(candidate)
	if err != nil {
		return "", fmt.Errorf("cannot access file: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("path must point to a regular file")
	}

	// Verify the file is inside an allowed root (home dir or temp dir).
	homeDir, _ := os.UserHomeDir()
	rawAllowedRoots := []string{os.TempDir()}
	if homeDir != "" {
		rawAllowedRoots = append(rawAllowedRoots, homeDir)
	}

	for _, root := range rawAllowedRoots {
		realRoot, errRoot := filepath.EvalSymlinks(filepath.Clean(root))
		if errRoot != nil {
			continue
		}
		rel, err := filepath.Rel(realRoot, candidate)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
			continue
		}
		return candidate, nil
	}

	return "", fmt.Errorf("path is outside allowed directories (must be within home or temp dir)")
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

	switch kind {
	case "deployment":
		revisions, err := deploymentRevisions(r.Context(), cs, namespace, name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(revisions)
	default:
		http.Error(w, fmt.Sprintf("unsupported kind for rollout history: %s", kind), http.StatusBadRequest)
	}
}

// revisionEntry is the structured rollout history entry returned to the client.
type revisionEntry struct {
	Revision int64    `json:"revision"`
	Current  bool     `json:"current"`
	Age      string   `json:"age"`
	Images   []string `json:"images"`
	Desired  int32    `json:"desired"`
	Ready    int32    `json:"ready"`
}

// deploymentRevisions returns a sorted (newest first) list of revision summaries
// for a Deployment by inspecting its owned ReplicaSets.
func deploymentRevisions(ctx context.Context, cs kubernetes.Interface, namespace, name string) ([]revisionEntry, error) {
	deploy, err := cs.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get deployment: %w", err)
	}

	currentRevision, _ := ops.ParseRevision(deploy.Annotations)

	selector, err := metav1.LabelSelectorAsSelector(deploy.Spec.Selector)
	if err != nil {
		return nil, fmt.Errorf("failed to build label selector: %w", err)
	}
	rsList, err := cs.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selector.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list replicasets: %w", err)
	}

	var entries []revisionEntry
	for _, rs := range rsList.Items {
		// Only include ReplicaSets owned by this specific Deployment.
		// Label selectors alone are insufficient — overlapping labels
		// (common with Helm) can match RSes from sibling Deployments.
		owned := false
		for _, ref := range rs.OwnerReferences {
			if ref.Kind == "Deployment" && ref.Name == name {
				owned = true
				break
			}
		}
		if !owned {
			continue
		}

		rev, ok := ops.ParseRevision(rs.Annotations)
		if !ok {
			continue
		}

		images := make([]string, 0, len(rs.Spec.Template.Spec.Containers))
		for _, c := range rs.Spec.Template.Spec.Containers {
			images = append(images, c.Image)
		}

		desired := int32(1)
		if rs.Spec.Replicas != nil {
			desired = *rs.Spec.Replicas
		}

		entries = append(entries, revisionEntry{
			Revision: rev,
			Current:  rev == currentRevision,
			Age:      humanAge(rs.CreationTimestamp.Time),
			Images:   images,
			Desired:  desired,
			Ready:    rs.Status.ReadyReplicas,
		})
	}

	// Sort newest revision first.
	sort.Slice(entries, func(i, j int) bool { return entries[i].Revision > entries[j].Revision })
	return entries, nil
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

// humanAge returns a human-readable age string (e.g. "2d", "4h", "35m") for
// a given timestamp, matching the style used by kubectl.
func humanAge(t time.Time) string {
	d := time.Since(t)
	d = max(d, 0)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
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
	currentRevision, hasRevision := ops.ParseRevision(deploy.Annotations)
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
			if rev, ok := ops.ParseRevision(owned[i].Annotations); ok && rev != currentRevision && rev > bestRev {
				bestRev = rev
				targetRS = &owned[i]
			}
		}
	} else {
		for i := range owned {
			if rev, ok := ops.ParseRevision(owned[i].Annotations); ok && rev == targetRevision {
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

	patch := fmt.Appendf(nil, `{"spec":{"unschedulable":%v}}`, unschedulable)
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
	// After truncating, strip any trailing non-alphanumeric characters so the
	// name satisfies the Kubernetes DNS label rule (must end with [a-z0-9]).
	if len(jobName) > 63 {
		jobName = jobName[:63]
		jobName = strings.TrimRight(jobName, "-._")
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
