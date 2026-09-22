package exec

import (
	"testing"
	"time"

	"k8s.io/client-go/tools/remotecommand"
)

func TestSizeQueue_PushThenNext(t *testing.T) {
	q := NewSizeQueue()
	defer q.Close()

	q.Push(remotecommand.TerminalSize{Width: 80, Height: 24})

	got := q.Next()
	if got == nil {
		t.Fatal("Next() returned nil, want a size")
	}
	if got.Width != 80 || got.Height != 24 {
		t.Errorf("got %+v, want {80 24}", *got)
	}
}

func TestSizeQueue_LatestPushWinsWhenUnconsumed(t *testing.T) {
	q := NewSizeQueue()
	defer q.Close()

	q.Push(remotecommand.TerminalSize{Width: 80, Height: 24})
	q.Push(remotecommand.TerminalSize{Width: 120, Height: 40}) // pushed before anyone called Next()

	got := q.Next()
	if got == nil || got.Width != 120 || got.Height != 40 {
		t.Errorf("got %+v, want {120 40} (latest push should win)", got)
	}
}

func TestSizeQueue_NextBlocksUntilPush(t *testing.T) {
	q := NewSizeQueue()
	defer q.Close()

	done := make(chan *remotecommand.TerminalSize, 1)
	go func() { done <- q.Next() }()

	select {
	case <-done:
		t.Fatal("Next() returned before any Push()")
	case <-time.After(50 * time.Millisecond):
		// expected: still blocked
	}

	q.Push(remotecommand.TerminalSize{Width: 100, Height: 30})

	select {
	case got := <-done:
		if got == nil || got.Width != 100 {
			t.Errorf("got %+v, want {100 30}", got)
		}
	case <-time.After(time.Second):
		t.Fatal("Next() did not unblock after Push()")
	}
}

func TestSizeQueue_NextReturnsNilAfterClose(t *testing.T) {
	q := NewSizeQueue()
	q.Close()

	got := q.Next()
	if got != nil {
		t.Errorf("got %+v, want nil after Close()", got)
	}
}
