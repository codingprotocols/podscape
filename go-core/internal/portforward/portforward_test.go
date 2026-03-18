package portforward

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

// newTestManager returns a PortForwardManager with a custom runForwardFn so
// tests don't need a real Kubernetes server.
func newTestManager(fn func(req *ForwardRequest, errCh chan<- error) error) *PortForwardManager {
	return &PortForwardManager{
		Forwards:     make(map[string]*ForwardRequest),
		runForwardFn: fn,
	}
}

// TestStartForward_ReadySignal verifies that StartForward returns nil when the
// tunnel signals readyCh (normal successful establishment).
func TestStartForward_ReadySignal(t *testing.T) {
	t.Parallel()
	ReadyTimeout = 2 * time.Second
	t.Cleanup(func() { ReadyTimeout = 30 * time.Second })

	m := newTestManager(func(req *ForwardRequest, _ chan<- error) error {
		// Simulate a successfully established tunnel: signal readyCh and then
		// block until the caller closes StopCh.
		close(req.ReadyCh)
		<-req.StopCh
		return nil
	})

	if err := m.StartForward("pf-ready", "default", "my-pod", 8080, 80); err != nil {
		t.Errorf("expected nil, got %v", err)
	}

	// After a successful ready signal the entry stays in Forwards (tunnel alive).
	m.Lock()
	_, exists := m.Forwards["pf-ready"]
	m.Unlock()
	if !exists {
		t.Error("ForwardRequest should still be in Forwards map after ready")
	}

	// Clean up: stop the forward so the goroutine exits.
	m.StopForward("pf-ready")
}

// TestStartForward_ErrorBeforeReady verifies that when runForward signals errCh
// before readyCh fires, StartForward returns the error and removes the entry
// from the Forwards map.
func TestStartForward_ErrorBeforeReady(t *testing.T) {
	t.Parallel()
	ReadyTimeout = 2 * time.Second
	t.Cleanup(func() { ReadyTimeout = 30 * time.Second })

	wantErr := errors.New("connection refused")
	m := newTestManager(func(req *ForwardRequest, errCh chan<- error) error {
		// Simulate a tunnel that fails before becoming ready.
		errCh <- wantErr
		return wantErr
	})

	err := m.StartForward("pf-err", "default", "my-pod", 8080, 80)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err.Error() != wantErr.Error() {
		t.Errorf("got %q, want %q", err.Error(), wantErr.Error())
	}

	// Entry must be removed from Forwards on error.
	m.Lock()
	_, exists := m.Forwards["pf-err"]
	m.Unlock()
	if exists {
		t.Error("ForwardRequest should not remain in Forwards map after error")
	}
}

// TestStartForward_Timeout verifies that when neither readyCh nor errCh fires
// within ReadyTimeout, StartForward returns a descriptive timeout error and
// closes StopCh to unblock the goroutine.
func TestStartForward_Timeout(t *testing.T) {
	t.Parallel()
	ReadyTimeout = 50 * time.Millisecond
	t.Cleanup(func() { ReadyTimeout = 30 * time.Second })

	stopped := make(chan struct{})
	m := newTestManager(func(req *ForwardRequest, _ chan<- error) error {
		// Simulate a tunnel that hangs indefinitely — neither readyCh nor errCh
		// is ever signalled.  Just wait until StopCh is closed (by the timeout
		// path in StartForward).
		<-req.StopCh
		close(stopped) // signal that the goroutine was properly unblocked
		return nil
	})

	err := m.StartForward("pf-timeout", "default", "my-pod", 8080, 80)
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
	if !strings.Contains(err.Error(), "pf-timeout") || !strings.Contains(err.Error(), "ready") {
		t.Errorf("unexpected timeout message: %q", err.Error())
	}

	// Goroutine must have been unblocked (StopCh closed) within a reasonable time.
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Error("goroutine was not unblocked after timeout")
	}

	// Entry must be removed.
	m.Lock()
	_, exists := m.Forwards["pf-timeout"]
	m.Unlock()
	if exists {
		t.Error("ForwardRequest should not remain in Forwards map after timeout")
	}
}

// TestStartForward_DuplicateID verifies that calling StartForward with an ID
// that is already active returns an immediate error without starting a new goroutine.
func TestStartForward_DuplicateID(t *testing.T) {
	t.Parallel()
	ReadyTimeout = 2 * time.Second
	t.Cleanup(func() { ReadyTimeout = 30 * time.Second })

	m := newTestManager(func(req *ForwardRequest, _ chan<- error) error {
		close(req.ReadyCh)
		<-req.StopCh
		return nil
	})

	// First forward — should succeed.
	if err := m.StartForward("pf-dup", "default", "my-pod", 8080, 80); err != nil {
		t.Fatalf("first StartForward failed unexpectedly: %v", err)
	}

	// Second forward with same ID — must fail immediately.
	err := m.StartForward("pf-dup", "default", "other-pod", 9090, 90)
	if err == nil {
		t.Fatal("expected duplicate-ID error, got nil")
	}
	want := fmt.Sprintf("forward %s already exists", "pf-dup")
	if err.Error() != want {
		t.Errorf("got %q, want %q", err.Error(), want)
	}

	m.StopForward("pf-dup")
}

// TestStopAll_NilManager verifies that StopAll on a nil manager is a safe no-op.
func TestStopAll_NilManager(t *testing.T) {
	t.Parallel()
	var m *PortForwardManager
	m.StopAll() // must not panic
}

// TestStopForward_UnknownID verifies that StopForward with a non-existent ID
// is a safe no-op.
func TestStopForward_UnknownID(t *testing.T) {
	t.Parallel()
	m := newTestManager(nil)
	m.StopForward("nonexistent") // must not panic or error
}
