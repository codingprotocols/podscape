package logs

import (
	"bufio"
	"context"
	"io"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
)

func StreamLogs(clientset kubernetes.Interface, ctx context.Context, namespace, pod, container string, tail int64, follow bool, previous bool) (io.ReadCloser, error) {
	podLogOpts := &corev1.PodLogOptions{
		Container: container,
		Follow:    follow,
		TailLines: &tail,
		Previous:  previous,
	}

	req := clientset.CoreV1().Pods(namespace).GetLogs(pod, podLogOpts)
	return req.Stream(ctx)
}

func CopyStream(stream io.ReadCloser, writer func([]byte) error) error {
	defer stream.Close()
	reader := bufio.NewReader(stream)
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		if err := writer(line); err != nil {
			return err
		}
	}
}
