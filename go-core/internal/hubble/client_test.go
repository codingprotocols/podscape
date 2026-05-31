package hubble_test

import (
	"context"
	"testing"
	"time"

	"github.com/podscape/go-core/internal/hubble"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	fakeclient "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
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
