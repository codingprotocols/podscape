package exec

import (
	"context"
	"io"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

func Exec(ctx context.Context, clientset kubernetes.Interface, config *rest.Config, ns, pod, container string, command []string, stdin io.Reader, stdout, stderr io.Writer, tty bool) error {
	req := clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(ns).
		SubResource("exec")

	option := &corev1.PodExecOptions{
		Container: container,
		Command:   command,
		Stdin:     stdin != nil,
		Stdout:    stdout != nil,
		Stderr:    stderr != nil,
		TTY:       tty,
	}

	req.VersionedParams(option, scheme.ParameterCodec)

	// Shallow-copy the config so NewSPDYExecutor's in-place write to
	// ContentConfig.NegotiatedSerializer doesn't race with concurrent exec calls
	// sharing the same *rest.Config from store.ActiveClientset().
	cfgCopy := *config
	executor, err := remotecommand.NewSPDYExecutor(&cfgCopy, "POST", req.URL())
	if err != nil {
		return err
	}

	return executor.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
		Tty:    tty,
	})
}
