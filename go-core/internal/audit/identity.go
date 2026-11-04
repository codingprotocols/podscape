package audit

import (
	"crypto/x509"
	"encoding/pem"
	"os"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/podscape/go-core/internal/client"
)

// ResolveIdentity returns the kubeconfig user name referenced by
// contextName (the kubeconfig "user" field's logical name — e.g. a
// GKE/EKS/AKS exec-plugin identity string, or a static kubeconfig user
// name; never the credential itself) and, best-effort, the Subject Common
// Name of any client certificate configured on cfg. Both are resolved on a
// best-effort basis: any failure (missing kubeconfig, unknown context, no
// client-cert auth, unparsable cert) results in an empty string for that
// field rather than an error, since identity enrichment must never block
// recording an audit event.
func ResolveIdentity(kubeconfigPath, contextName string, cfg *rest.Config) (kubeUser, certCN string) {
	path := client.ResolveKubeconfigPath(kubeconfigPath)
	if data, err := clientcmd.LoadFromFile(path); err == nil {
		if kctx, ok := data.Contexts[contextName]; ok {
			kubeUser = kctx.AuthInfo
		}
	}
	return kubeUser, certCommonName(cfg)
}

func certCommonName(cfg *rest.Config) string {
	if cfg == nil {
		return ""
	}
	certData := cfg.TLSClientConfig.CertData
	if len(certData) == 0 && cfg.TLSClientConfig.CertFile != "" {
		data, err := os.ReadFile(cfg.TLSClientConfig.CertFile)
		if err != nil {
			return ""
		}
		certData = data
	}
	if len(certData) == 0 {
		return ""
	}
	block, _ := pem.Decode(certData)
	if block == nil {
		return ""
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return ""
	}
	return cert.Subject.CommonName
}
