// Package hubble provides a lazy gRPC client for Cilium Hubble Relay.
// It port-forwards to a hubble-relay pod in kube-system on first use and
// establishes a gRPC connection to observe network flows.
package hubble

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	flowpb "github.com/cilium/cilium/api/v1/flow"
	observerpb "github.com/cilium/cilium/api/v1/observer"
	"github.com/podscape/go-core/internal/providers"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/timestamppb"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

const (
	hubbleRelayPort    = 4245
	tunnelReadyTimeout = 15 * time.Second
	dialFailedTTL      = 2 * time.Minute
)

// errHubbleAbsent is returned by findHubbleRelayPod when the k8s API is
// reachable but no hubble-relay pods exist under any known label selector.
// This is the only case where we cache the failure: Hubble is genuinely absent.
// Transient errors (API unavailable, pods starting up) must NOT use this sentinel
// so the negative cache is never set and the next topology request retries immediately.
var errHubbleAbsent = errors.New("hubble-relay not installed: no pods found")

// Flow captures the essential routing metadata for a single observed network flow.
type Flow struct {
	SrcNamespace string
	SrcPod       string
	DstNamespace string
	DstPod       string
	DstService   string
	Verdict      string // "FORWARDED" | "DROPPED" | "ERROR" | ...
}

// Manager lazily creates a port-forward to hubble-relay and a gRPC connection
// on first GetFlows call. It is safe for concurrent use.
type Manager struct {
	mu         sync.Mutex
	clientset  kubernetes.Interface
	restConfig *rest.Config
	// generation increments on every Reset, letting in-flight fetches detect
	// that the cluster switched and discard stale results.
	generation uint64
	// dialFailedGen records the generation for which the last dial attempt
	// failed. When dialFailed is true and dialFailedGen == generation, further
	// attempts are suppressed until the next Reset (context switch) or until
	// dialFailedTTL elapses — allowing self-healing when Hubble is installed
	// mid-session without a context switch.
	dialFailed    bool
	dialFailedGen uint64
	dialFailedAt  time.Time
	// dialFailedTTL controls how long a cached dial failure suppresses retries.
	// Defaults to dialFailedTTL constant; injectable via SetDialFailedTTL for tests.
	dialFailedTTL time.Duration

	// dialingCh is non-nil while a dial is in progress; closed when the dial
	// finishes (success or failure). Concurrent GetFlows callers that arrive
	// while a dial is in flight wait on this channel instead of launching
	// independent tunnels.
	dialingCh chan struct{}

	// active tunnel state
	stopCh    chan struct{}
	localPort int
	grpcConn  *grpc.ClientConn
}

// NewManager returns a new idle Manager. Call Reset to attach Kubernetes clients.
func NewManager() *Manager {
	return &Manager{dialFailedTTL: dialFailedTTL}
}

// SetDialFailedTTL overrides the negative-cache timeout. Intended for testing;
// the default (2 minutes) is set by NewManager.
func (m *Manager) SetDialFailedTTL(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dialFailedTTL = d
}

// DefaultManager is the package-level singleton used by the rest of the sidecar.
var DefaultManager = NewManager()

// Init attaches Kubernetes clients to the DefaultManager, tearing down any
// existing connection first.
func Init(clientset kubernetes.Interface, config *rest.Config) {
	DefaultManager.Reset(clientset, config)
}

// WarmUp fires a background goroutine that establishes the port-forward and
// gRPC connection proactively so the first /topology request does not block
// waiting for tunnel setup. It is a no-op when clients are nil.
func (m *Manager) WarmUp() {
	m.mu.Lock()
	if m.clientset == nil || m.restConfig == nil {
		m.mu.Unlock()
		return
	}
	m.mu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), tunnelReadyTimeout+5*time.Second)
		defer cancel()
		_, _ = m.GetFlows(ctx, "", 0)
	}()
}

// Reset tears down any existing tunnel and gRPC connection, then records new
// Kubernetes clients. Passing nil clients is safe — subsequent GetFlows calls
// will return empty slices without error.
func (m *Manager) Reset(clientset kubernetes.Interface, config *rest.Config) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.teardownLocked()
	m.generation++
	m.dialFailed = false
	m.dialFailedGen = 0
	m.dialFailedAt = time.Time{}
	m.clientset = clientset
	m.restConfig = config
}

// IsConnected returns true when an active gRPC connection exists.
func (m *Manager) IsConnected() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.grpcConn != nil
}

// GetFlows returns a snapshot of network flows for the given namespace over the
// trailing window. It returns nil (nil error) when no Kubernetes clients are
// configured or when Hubble is unreachable.
//
// Connection setup (port-forward + gRPC dial) is performed outside the manager
// lock so concurrent Reset calls are never blocked waiting for the tunnel.
func (m *Manager) GetFlows(ctx context.Context, namespace string, window time.Duration) ([]Flow, error) {
	m.mu.Lock()
	if m.clientset == nil || m.restConfig == nil {
		m.mu.Unlock()
		return nil, nil
	}

	// Fast path: reuse an existing connection.
	if m.grpcConn != nil {
		conn := m.grpcConn
		gen := m.generation
		m.mu.Unlock()
		return m.fetchFlows(ctx, conn, namespace, window, gen)
	}

	// Negative cache: if dial already failed for this generation (e.g. Hubble
	// not installed), skip re-dialing until the TTL expires or the next context
	// switch. The TTL allows self-healing when Hubble is installed mid-session.
	if m.dialFailed && m.dialFailedGen == m.generation {
		if time.Since(m.dialFailedAt) < m.dialFailedTTL {
			m.mu.Unlock()
			return nil, nil
		}
		// TTL expired — clear the cache and let the dial proceed.
		m.dialFailed = false
	}

	// Slow path: establish port-forward + gRPC connection outside the lock.
	// Singleflight: if another goroutine is already dialing, wait for it to
	// finish and retry rather than launching a second parallel tunnel.
	if m.dialingCh != nil {
		waitCh := m.dialingCh
		m.mu.Unlock()
		select {
		case <-waitCh:
		case <-ctx.Done():
			return nil, nil
		}
		return m.GetFlows(ctx, namespace, window)
	}
	dialCh := make(chan struct{})
	m.dialingCh = dialCh

	cs := m.clientset
	cfg := m.restConfig
	gen := m.generation
	m.mu.Unlock()

	conn, stopCh, localPort, cacheable, err := dial(ctx, cs, cfg)

	// Re-acquire lock to commit dial result and unblock waiters atomically.
	m.mu.Lock()
	m.dialingCh = nil
	close(dialCh) // wake concurrent waiters after state is committed

	if err != nil {
		log.Printf("[hubble] dial failed: %v", err)
		if cacheable && m.generation == gen {
			m.dialFailed = true
			m.dialFailedGen = gen
			m.dialFailedAt = time.Now()
		}
		m.mu.Unlock()
		return nil, nil
	}

	if m.generation != gen {
		m.mu.Unlock()
		close(stopCh)
		_ = conn.Close()
		return nil, nil
	}
	m.grpcConn = conn
	m.stopCh = stopCh
	m.localPort = localPort
	m.dialFailed = false
	m.dialFailedGen = 0
	m.mu.Unlock()

	return m.fetchFlows(ctx, conn, namespace, window, gen)
}

// fetchFlows streams flows from the Observer gRPC service and collects them.
// gen is the generation captured before the lock was released; results are
// discarded if generation changes mid-stream (cross-cluster bleed guard).
func (m *Manager) fetchFlows(ctx context.Context, conn *grpc.ClientConn, namespace string, window time.Duration, gen uint64) ([]Flow, error) {
	client := observerpb.NewObserverClient(conn)

	req := &observerpb.GetFlowsRequest{
		Follow: false,
		Since:  timestamppb.New(time.Now().Add(-window)),
	}
	// Only filter by namespace when one is specified. An empty namespace prefix
	// ("/" or "/podname") is not a valid Hubble pod selector and returns nothing.
	if namespace != "" {
		req.Whitelist = []*observerpb.FlowFilter{
			{SourcePod: []string{namespace + "/"}},
			{DestinationPod: []string{namespace + "/"}},
		}
	}

	stream, err := client.GetFlows(ctx, req)
	if err != nil {
		// Log the RPC error so operators can distinguish "Hubble not installed"
		// (handled by the negative cache / pod-not-found path) from "Hubble
		// requires TLS" (grpc transport error) or other misconfiguration.
		log.Printf("[hubble] GetFlows RPC failed: %v", err)
		m.mu.Lock()
		if m.generation == gen {
			m.teardownLocked()
		}
		m.mu.Unlock()
		return nil, nil
	}

	var flows []Flow
	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Tear down so the next call reconnects cleanly. A transient
			// mid-stream error on the current generation still yields whatever
			// flows were collected so far — partial data beats an empty map for
			// the same cluster. Staleness is checked below.
			m.mu.Lock()
			if m.generation == gen {
				m.teardownLocked()
			}
			m.mu.Unlock()
			break
		}

		f := resp.GetFlow()
		if f == nil {
			continue
		}

		flow := Flow{Verdict: verdictString(f.GetVerdict())}
		if src := f.GetSource(); src != nil {
			flow.SrcNamespace = src.GetNamespace()
			flow.SrcPod = src.GetPodName()
		}
		if dst := f.GetDestination(); dst != nil {
			flow.DstNamespace = dst.GetNamespace()
			flow.DstPod = dst.GetPodName()
		}
		if svc := f.GetDestinationService(); svc != nil {
			flow.DstService = svc.GetName()
		}
		flows = append(flows, flow)
	}

	// Discard results if the cluster switched mid-stream.
	m.mu.Lock()
	stale := m.generation != gen
	m.mu.Unlock()
	if stale {
		return nil, nil
	}
	return flows, nil
}

// dial creates a port-forward tunnel and gRPC connection to hubble-relay.
// Called outside the manager lock to avoid blocking Reset.
// cacheable is true only when the failure indicates Hubble is not installed
// (pod not found). Port-forward and gRPC errors are transient — do not cache
// them, or a momentary port collision blocks Hubble until the next Reset.
func dial(ctx context.Context, cs kubernetes.Interface, cfg *rest.Config) (conn *grpc.ClientConn, stopCh chan struct{}, localPort int, cacheable bool, err error) {
	podName, podErr := findHubbleRelayPod(ctx, cs)
	if podErr != nil {
		// Cache only when Hubble is definitively absent (errHubbleAbsent): API
		// reachable, no pods found under any selector. All other failures are
		// transient (pods starting up, API error, context cancellation) and must
		// not be cached so the next topology request retries immediately.
		cacheable = errors.Is(podErr, errHubbleAbsent)
		return nil, nil, 0, cacheable, fmt.Errorf("hubble-relay pod not found: %w", podErr)
	}

	stopCh, localPort, err = startPortForward(ctx, cfg, podName)
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("port-forward failed: %w", err)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", localPort)
	conn, err = grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		close(stopCh)
		return nil, nil, 0, false, fmt.Errorf("grpc dial: %w", err)
	}

	return conn, stopCh, localPort, false, nil
}

// startPortForward creates a SPDY port-forward tunnel to the given pod
// and waits up to tunnelReadyTimeout for it to be ready. It uses port 0 so the
// OS picks a free ephemeral port, eliminating the TOCTOU window that exists
// when a port is probed and then passed to portforward.New.
func startPortForward(ctx context.Context, cfg *rest.Config, podName string) (chan struct{}, int, error) {
	rawURL := fmt.Sprintf("%s/api/v1/namespaces/%s/pods/%s/portforward",
		cfg.Host, providers.HubbleRelayNamespace, podName)
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, 0, err
	}

	transport, upgrader, err := spdy.RoundTripperFor(cfg)
	if err != nil {
		return nil, 0, err
	}

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport, Timeout: tunnelReadyTimeout + 5*time.Second}, http.MethodPost, u)
	ports := []string{fmt.Sprintf("0:%d", hubbleRelayPort)}

	stopCh := make(chan struct{})
	readyCh := make(chan struct{})
	errCh := make(chan error, 1)

	pf, err := portforward.New(dialer, ports, stopCh, readyCh, io.Discard, io.Discard)
	if err != nil {
		close(stopCh)
		return nil, 0, err
	}

	go func() {
		if err := pf.ForwardPorts(); err != nil {
			select {
			case <-readyCh:
				// Already ready — normal teardown.
			default:
				select {
				case errCh <- err:
				default:
				}
			}
		}
	}()

	timer := time.NewTimer(tunnelReadyTimeout)
	defer timer.Stop()

	select {
	case <-readyCh:
	case err := <-errCh:
		close(stopCh)
		return nil, 0, err
	case <-timer.C:
		close(stopCh)
		return nil, 0, fmt.Errorf("hubble port-forward did not become ready within %s", tunnelReadyTimeout)
	case <-ctx.Done():
		close(stopCh)
		return nil, 0, ctx.Err()
	}

	// Retrieve the actual OS-assigned local port after the tunnel is ready.
	fwPorts, err := pf.GetPorts()
	if err != nil {
		close(stopCh)
		return nil, 0, fmt.Errorf("failed to get bound port: %w", err)
	}
	if len(fwPorts) == 0 {
		close(stopCh)
		return nil, 0, fmt.Errorf("port-forward ready but GetPorts returned no entries")
	}
	return stopCh, int(fwPorts[0].Local), nil
}

// findHubbleRelayPod returns the name of a Running hubble-relay pod in kube-system.
// It tries "k8s-app=<service>" first, then "app=<service>".
//
// Error semantics (used by dial() to set the cacheable flag):
//   - errHubbleAbsent: API reachable, zero pods matched — Hubble not installed (cacheable).
//   - plain fmt.Errorf (no %w): pods exist but none Running yet (startup) — not cacheable.
//   - error wrapping lastErr: k8s API call failed — not cacheable.
func findHubbleRelayPod(ctx context.Context, cs kubernetes.Interface) (string, error) {
	var lastErr error
	foundAny := false
	for _, selector := range []string{
		"k8s-app=" + providers.HubbleRelayService,
		"app=" + providers.HubbleRelayService,
	} {
		pods, err := cs.CoreV1().Pods(providers.HubbleRelayNamespace).List(ctx, metav1.ListOptions{
			LabelSelector: selector,
		})
		if err != nil {
			lastErr = err
			continue
		}
		for i := range pods.Items {
			if pods.Items[i].Status.Phase == corev1.PodRunning {
				return pods.Items[i].Name, nil
			}
			foundAny = true
		}
	}
	if lastErr != nil {
		// k8s API error — transient, do not cache.
		return "", fmt.Errorf("no running hubble-relay pod found in %s: %w", providers.HubbleRelayNamespace, lastErr)
	}
	if foundAny {
		// Pods exist but none Running yet (ContainerCreating / CrashLoopBackOff).
		// Hubble is being started — do not cache so the next request retries.
		return "", fmt.Errorf("hubble-relay pods found in %s but none are Running", providers.HubbleRelayNamespace)
	}
	// No pods found and no API error: Hubble is genuinely not installed.
	return "", errHubbleAbsent
}

// teardownLocked closes the gRPC connection and stops the port-forward.
// The caller must hold m.mu.
func (m *Manager) teardownLocked() {
	if m.grpcConn != nil {
		_ = m.grpcConn.Close()
		m.grpcConn = nil
	}
	if m.stopCh != nil {
		close(m.stopCh)
		m.stopCh = nil
	}
	m.localPort = 0
	// Clear the negative-cache flag so the next GetFlows call attempts a fresh
	// dial. Without this, a stale dialFailed=true (set by a concurrent-dial loser
	// after the winner already cleared it) survives teardown and causes a 2-minute
	// blackout even though Hubble is fully operational.
	m.dialFailed = false
	m.dialFailedGen = 0
}

// verdictString converts a Cilium flow Verdict to its canonical string name.
func verdictString(v flowpb.Verdict) string {
	return v.String()
}
