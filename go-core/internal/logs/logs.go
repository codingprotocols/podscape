package logs

import (
	"bufio"
	"context"
	"io"
	"sync"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
)

// onceReadCloser wraps an io.ReadCloser so Close is idempotent: only the first
// call closes the underlying reader; subsequent calls are no-ops. Use it when
// two independent code paths each hold a reference and may both call Close.
type onceReadCloser struct {
	io.ReadCloser
	once sync.Once
}

func (o *onceReadCloser) Close() error {
	o.once.Do(func() { _ = o.ReadCloser.Close() })
	return nil
}

// NewOnceCloser returns an io.ReadCloser whose Close executes at most once.
func NewOnceCloser(rc io.ReadCloser) io.ReadCloser {
	return &onceReadCloser{ReadCloser: rc}
}

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
		// Flush any data before inspecting the error — ReadBytes returns
		// (data, io.EOF) simultaneously when the stream ends mid-line
		// (crash logs, killed containers), so checking err first would
		// silently drop the final partial line.
		if len(line) > 0 {
			if werr := writer(line); werr != nil {
				return werr
			}
		}
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}
