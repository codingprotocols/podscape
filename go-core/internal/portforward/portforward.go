package portforward

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

type ForwardRequest struct {
	Namespace  string
	PodName    string
	LocalPort  int
	RemotePort int
	StopCh     chan struct{}
	ReadyCh    chan struct{}
	// restConfig is snapshotted from the manager at StartForward time so this
	// tunnel keeps working even after the active context is switched.
	restConfig *rest.Config
}

type PortForwardManager struct {
	sync.Mutex
	Forwards  map[string]*ForwardRequest
	Clientset kubernetes.Interface
	Config    *rest.Config
	// runForwardFn replaces the real runForward implementation when set.
	// Used in tests to simulate tunnel behaviour without a real Kubernetes server.
	runForwardFn func(req *ForwardRequest, errCh chan<- error) error
}

func NewManager(clientset kubernetes.Interface, config *rest.Config) *PortForwardManager {
	return &PortForwardManager{
		Forwards:  make(map[string]*ForwardRequest),
		Clientset: clientset,
		Config:    config,
	}
}

// ReadyTimeout is the maximum time StartForward will wait for a tunnel to become ready.
// Override in tests to avoid 30-second delays.
var ReadyTimeout = 30 * time.Second

func (m *PortForwardManager) StartForward(id, namespace, podName string, localPort, remotePort int) error {
	m.Lock()
	if _, ok := m.Forwards[id]; ok {
		m.Unlock()
		return fmt.Errorf("forward %s already exists", id)
	}

	stopCh := make(chan struct{})
	readyCh := make(chan struct{})
	errCh := make(chan error, 1)

	req := &ForwardRequest{
		Namespace:  namespace,
		PodName:    podName,
		LocalPort:  localPort,
		RemotePort: remotePort,
		StopCh:     stopCh,
		ReadyCh:    readyCh,
		restConfig: m.Config, // snapshot current context's config at creation time
	}
	m.Forwards[id] = req
	m.Unlock()

	runFn := m.runForward
	if m.runForwardFn != nil {
		runFn = m.runForwardFn
	}
	go func() {
		if err := runFn(req, errCh); err != nil {
			fmt.Printf("Port forward error for %s: %v\n", id, err)
		}
		m.Lock()
		delete(m.Forwards, id)
		m.Unlock()
	}()

	// Block until the tunnel is ready, fails, or times out.
	// This ensures the HTTP caller only sees 200 when the tunnel is actually up.
	select {
	case <-readyCh:
		return nil
	case err := <-errCh:
		m.Lock()
		delete(m.Forwards, id)
		m.Unlock()
		return err
	case <-time.After(ReadyTimeout):
		m.Lock()
		if r, ok := m.Forwards[id]; ok {
			close(r.StopCh)
			delete(m.Forwards, id)
		}
		m.Unlock()
		return fmt.Errorf("port forward %s: tunnel did not become ready within %s", id, ReadyTimeout)
	}
}

func (m *PortForwardManager) StopForward(id string) {
	if m == nil {
		return
	}
	m.Lock()
	defer m.Unlock()
	if req, ok := m.Forwards[id]; ok {
		close(req.StopCh)
		delete(m.Forwards, id)
	}
}

// StopAll terminates every active port-forward. Call this before switching contexts.
func (m *PortForwardManager) StopAll() {
	if m == nil {
		return
	}
	m.Lock()
	defer m.Unlock()
	if m.Forwards == nil {
		return
	}
	for id, req := range m.Forwards {
		close(req.StopCh)
		delete(m.Forwards, id)
	}
}

// UpdateClients swaps the clientset and REST config used for new port-forwards.
// Existing forwards have already been stopped via StopAll before this is called.
func (m *PortForwardManager) UpdateClients(clientset kubernetes.Interface, config *rest.Config) {
	if m == nil {
		return
	}
	m.Lock()
	defer m.Unlock()
	m.Clientset = clientset
	m.Config = config
}

func (m *PortForwardManager) runForward(req *ForwardRequest, errCh chan<- error) error {
	path := fmt.Sprintf("/api/v1/namespaces/%s/pods/%s/portforward", req.Namespace, req.PodName)
	hostIP := req.restConfig.Host
	u, err := url.Parse(hostIP)
	if err != nil {
		errCh <- err
		return err
	}
	u.Path = path

	transport, upgrader, err := spdy.RoundTripperFor(req.restConfig)
	if err != nil {
		errCh <- err
		return err
	}

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, u)

	ports := []string{fmt.Sprintf("%d:%d", req.LocalPort, req.RemotePort)}

	pf, err := portforward.New(dialer, ports, req.StopCh, req.ReadyCh, os.Stdout, os.Stderr)
	if err != nil {
		errCh <- err
		return err
	}

	err = pf.ForwardPorts()
	// If ReadyCh was never signaled, ForwardPorts failed before the tunnel came up.
	// Propagate to StartForward so it can unblock and return the error.
	select {
	case <-req.ReadyCh:
		// ReadyCh was already signaled — this is a normal teardown, StartForward already returned.
	default:
		if err != nil {
			select {
			case errCh <- err:
			default: // StartForward already timed out and cleaned up.
			}
		}
	}
	return err
}

var Manager *PortForwardManager

func Init(clientset kubernetes.Interface, config *rest.Config) {
	Manager = NewManager(clientset, config)
}
