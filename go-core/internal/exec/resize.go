package exec

import "k8s.io/client-go/tools/remotecommand"

// SizeQueue implements remotecommand.TerminalSizeQueue over a channel, so an
// interactive exec session can be resized after it starts. It intentionally
// keeps only the most recent size: if two resizes happen before the executor
// calls Next(), the older one is dropped rather than queued, since only the
// terminal's current dimensions matter.
type SizeQueue struct {
	ch chan remotecommand.TerminalSize
}

func NewSizeQueue() *SizeQueue {
	return &SizeQueue{ch: make(chan remotecommand.TerminalSize, 1)}
}

// Push records a new size, replacing any unconsumed size already queued.
// Safe to call from a single producer goroutine (the exec WebSocket's read-pump).
func (q *SizeQueue) Push(size remotecommand.TerminalSize) {
	for {
		select {
		case q.ch <- size:
			return
		default:
			select {
			case <-q.ch:
			default:
			}
		}
	}
}

// Next blocks until a size is available or the queue is closed, per the
// remotecommand.TerminalSizeQueue contract (nil signals "no more resizes").
func (q *SizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.ch
	if !ok {
		return nil
	}
	return &size
}

// Close signals Next() to stop blocking and return nil. Safe to call once;
// the exec session's cleanup path (HandleExec) owns exactly one Close() call.
func (q *SizeQueue) Close() {
	close(q.ch)
}
