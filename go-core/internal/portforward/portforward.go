package portforward

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sync"

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
	Forwards map[string]*ForwardRequest
	Clientset *kubernetes.Clientset
	Config    *rest.Config
}

func NewManager(clientset *kubernetes.Clientset, config *rest.Config) *PortForwardManager {
	return &PortForwardManager{
		Forwards:  make(map[string]*ForwardRequest),
		Clientset: clientset,
		Config:    config,
	}
}

func (m *PortForwardManager) StartForward(id, namespace, podName string, localPort, remotePort int) error {
	m.Lock()
	if _, ok := m.Forwards[id]; ok {
		m.Unlock()
		return fmt.Errorf("forward %s already exists", id)
	}

	stopCh := make(chan struct{})
	readyCh := make(chan struct{})

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

	go func() {
		err := m.runForward(req)
		if err != nil {
			fmt.Printf("Port forward error for %s: %v\n", id, err)
		}
		m.Lock()
		delete(m.Forwards, id)
		m.Unlock()
	}()

	return nil
}

func (m *PortForwardManager) StopForward(id string) {
	m.Lock()
	defer m.Unlock()
	if req, ok := m.Forwards[id]; ok {
		close(req.StopCh)
		delete(m.Forwards, id)
	}
}

// StopAll terminates every active port-forward. Call this before switching contexts.
func (m *PortForwardManager) StopAll() {
	m.Lock()
	defer m.Unlock()
	for id, req := range m.Forwards {
		close(req.StopCh)
		delete(m.Forwards, id)
	}
}

// UpdateClients swaps the clientset and REST config used for new port-forwards.
// Existing forwards have already been stopped via StopAll before this is called.
func (m *PortForwardManager) UpdateClients(clientset *kubernetes.Clientset, config *rest.Config) {
	m.Lock()
	defer m.Unlock()
	m.Clientset = clientset
	m.Config = config
}

func (m *PortForwardManager) runForward(req *ForwardRequest) error {
	path := fmt.Sprintf("/api/v1/namespaces/%s/pods/%s/portforward", req.Namespace, req.PodName)
	hostIP := req.restConfig.Host
	u, err := url.Parse(hostIP)
	if err != nil {
		return err
	}
	u.Path = path

	transport, upgrader, err := spdy.RoundTripperFor(req.restConfig)
	if err != nil {
		return err
	}

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, u)

	ports := []string{fmt.Sprintf("%d:%d", req.LocalPort, req.RemotePort)}

	pf, err := portforward.New(dialer, ports, req.StopCh, req.ReadyCh, os.Stdout, os.Stderr)
	if err != nil {
		return err
	}

	return pf.ForwardPorts()
}

var Manager *PortForwardManager

func Init(clientset *kubernetes.Clientset, config *rest.Config) {
	Manager = NewManager(clientset, config)
}
