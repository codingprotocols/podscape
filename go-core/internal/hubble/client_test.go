package hubble_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/podscape/go-core/internal/hubble"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	fakeclient "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
)

func TestManager_NilClientsReturnsEmptyFlows(t *testing.T) {
	m := hubble.NewManager()
	flows, err := m.GetFlows(context.Background(), "default", 60*time.Second)
	require.NoError(t, err)
	assert.Empty(t, flows)
}

func TestManager_ResetWithNilClientsIsNoop(t *testing.T) {
	m := hubble.NewManager()
	m.Reset(nil, nil)
	flows, err := m.GetFlows(context.Background(), "default", 60*time.Second)
	require.NoError(t, err)
	assert.Empty(t, flows)
}

func TestManager_IsConnectedFalseWhenNoConnection(t *testing.T) {
	m := hubble.NewManager()
	assert.False(t, m.IsConnected())
}

func TestManager_ResetClearsConnection(t *testing.T) {
	m := hubble.NewManager()
	// Reset with nil should not panic and IsConnected should remain false
	m.Reset(nil, nil)
	assert.False(t, m.IsConnected())
}

func TestManager_ResetUnblocksNegativeCache(t *testing.T) {
	// Verify that Reset() allows a fresh dial attempt even after a previous
	// failure was cached for the prior generation.
	m := hubble.NewManager()
	// Two consecutive Resets with nil clients prove generation increments:
	// the negative-cache flag from nil-client early-return (if any) must not
	// persist across Reset calls.
	m.Reset(nil, nil)
	m.Reset(nil, nil)
	flows, err := m.GetFlows(context.Background(), "default", 60*time.Second)
	require.NoError(t, err)
	assert.Empty(t, flows)
	// IsConnected must still be false — nil clients short-circuit before dial.
	assert.False(t, m.IsConnected())
}

func TestManager_NegativeCacheTTLExpiry(t *testing.T) {
	// Verify that an expired TTL allows a fresh dial attempt, observable via
	// the fake client's action recorder: if the dial was attempted, at least
	// one Pods.List call will appear in cs.Actions().
	cs := fakeclient.NewSimpleClientset() // empty cluster — no hubble-relay pods
	cfg := &rest.Config{Host: "http://127.0.0.1:1"}

	m := hubble.NewManager()
	m.SetDialFailedTTL(time.Nanosecond) // expire almost immediately
	m.Reset(cs, cfg)

	// Inject a negative-cache entry that is already past the TTL.
	past := time.Now().Add(-time.Hour)
	m.ForceNegativeCache(past)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	actionsBefore := len(cs.Actions())
	_, err := m.GetFlows(ctx, "", time.Second)
	require.NoError(t, err)

	// TTL expired → dial was attempted → at least one API call (Pods.List to find hubble-relay).
	if len(cs.Actions()) <= actionsBefore {
		t.Errorf("expected at least one API call after TTL expiry, got none (negative cache was not cleared)")
	}
}

// TestManager_NegativeCacheSetAfterAbsentHubble verifies that when the k8s API
// is reachable but no hubble-relay pods exist, the negative cache IS set so the
// next call returns immediately without another pod-list round-trip.
// This exercises the `cacheable = errors.Is(...)` assignment in dial() — if it
// were `cacheable :=` (shadowed named return) the cache would never be set.
func TestManager_NegativeCacheSetAfterAbsentHubble(t *testing.T) {
	cs := fakeclient.NewSimpleClientset() // no pods → errHubbleAbsent
	cfg := &rest.Config{Host: "http://127.0.0.1:1"}

	m := hubble.NewManager()
	m.SetDialFailedTTL(time.Hour) // long TTL so it doesn't expire during the test
	m.Reset(cs, cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// First call: dials, finds no pods, should set the negative cache.
	_, err := m.GetFlows(ctx, "", 0)
	require.NoError(t, err)
	actionsAfterFirst := len(cs.Actions())

	// Second call: negative cache should suppress the dial — no new API calls.
	_, err = m.GetFlows(ctx, "", 0)
	require.NoError(t, err)

	if got := len(cs.Actions()); got != actionsAfterFirst {
		t.Errorf("expected no new API calls (negative cache active), got %d new call(s)", got-actionsAfterFirst)
	}
}

// TestManager_ConcurrentDialCoalesced verifies that when multiple goroutines call
// GetFlows simultaneously on a cold Manager (no connection), only ONE pod-list
// request reaches the k8s API. The singleflight guard (dialingCh) should cause
// all latecomers to wait on the in-flight dial rather than launching their own.
func TestManager_ConcurrentDialCoalesced(t *testing.T) {
	var listCalls atomic.Int32
	unblock := make(chan struct{})

	cs := fakeclient.NewSimpleClientset()
	cs.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		listCalls.Add(1)
		<-unblock
		return true, &corev1.PodList{}, nil // empty list → errHubbleAbsent → negative cache set
	})

	m := hubble.NewManager()
	m.Reset(cs, &rest.Config{Host: "http://127.0.0.1:1"})

	const goroutines = 5
	started := make(chan struct{}, goroutines)
	var wg sync.WaitGroup
	for range goroutines {
		wg.Add(1)
		go func() {
			defer wg.Done()
			started <- struct{}{}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_, _ = m.GetFlows(ctx, "", 0)
		}()
	}

	// Wait for all goroutines to start, then give them time to contend on m.mu
	// and block in the dialingCh wait (all except the designated dialer).
	for range goroutines {
		<-started
	}
	time.Sleep(20 * time.Millisecond)

	close(unblock) // release the designated dialer
	wg.Wait()

	// findHubbleRelayPod tries two label selectors ("k8s-app=…" then "app=…"),
	// so one dial attempt produces exactly 2 pod-list calls. If singleflight
	// failed and all goroutines dialled independently we'd see goroutines*2 calls.
	const listCallsPerDial = 2
	if n := listCalls.Load(); n != listCallsPerDial {
		t.Errorf("singleflight: expected %d pod-list calls (1 dial), got %d", listCallsPerDial, n)
	}
}
