package providers

import (
	"strings"

	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/client-go/discovery"
)

const (
	// HubbleRelayNamespace is the namespace where the hubble-relay Service lives.
	HubbleRelayNamespace = "kube-system"
	// HubbleRelayService is the Service name used to detect Hubble Relay presence.
	HubbleRelayService = "hubble-relay"
)

// ProviderSet describes which ingress controllers and service mesh providers
// are installed in the current cluster. All fields default to false.
type ProviderSet struct {
	Istio          bool   `json:"istio"`
	IstioVersion   string `json:"istioVersion,omitempty"`
	Traefik        bool   `json:"traefik"`
	TraefikVersion string `json:"traefikVersion,omitempty"` // "v2" or "v3"
	NginxInc       bool   `json:"nginxInc"`                 // kubernetes-ingress (NGINX Inc, CRD-based)
	NginxCommunity bool   `json:"nginxCommunity"`           // ingress-nginx (community, annotation-based)
	Keda           bool   `json:"keda"`
	Cilium         bool   `json:"cilium"`
	HubbleRelay    bool   `json:"hubbleRelay"`
	Ambassador     bool   `json:"ambassador"`
}

// Detect probes the cluster's API group list and IngressClass resources to
// determine which ingress and service mesh providers are installed.
// hubbleRelayPresent should be true when the hubble-relay Service exists in
// kube-system; it is set independently of API-group discovery so it survives
// clusters with restricted discovery RBAC. All other providers require a
// successful ServerGroups call — failures leave them false so the app degrades
// gracefully.
func Detect(disco discovery.DiscoveryInterface, ingressClasses []networkingv1.IngressClass, hubbleRelayPresent bool) ProviderSet {
	var ps ProviderSet

	// HubbleRelay is based on a Service existence check, not API-group
	// discovery, so assign it before the ServerGroups error guard.
	ps.HubbleRelay = hubbleRelayPresent

	groups, err := disco.ServerGroups()
	if err != nil {
		return ps
	}

	for _, g := range groups.Groups {
		switch g.Name {
		case "networking.istio.io":
			ps.Istio = true
			if len(g.Versions) > 0 {
				ps.IstioVersion = g.Versions[0].GroupVersion
			}
		case "traefik.io":
			ps.Traefik = true
			ps.TraefikVersion = "v3"
		case "traefik.containo.us":
			ps.Traefik = true
			// Only set v2 if v3 hasn't been detected from traefik.io.
			if ps.TraefikVersion == "" {
				ps.TraefikVersion = "v2"
			}
		case "k8s.nginx.org":
			ps.NginxInc = true
		case "keda.sh":
			ps.Keda = true
		case "cilium.io":
			ps.Cilium = true
		case "getambassador.io":
			ps.Ambassador = true
		}
	}

	// Community nginx has no proprietary API group — detect it via the
	// IngressClass controller field instead.
	for _, ic := range ingressClasses {
		ctrl := strings.ToLower(ic.Spec.Controller)
		if strings.Contains(ctrl, "ingress-nginx") || ctrl == "k8s.io/ingress-nginx" {
			ps.NginxCommunity = true
			break
		}
	}

	return ps
}
