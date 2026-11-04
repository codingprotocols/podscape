package audit

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"path/filepath"
	"testing"
	"time"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// writeTestKubeconfig writes a minimal kubeconfig where the context's
// AuthInfo name deliberately differs from the context name itself, so the
// test actually exercises "kube_user is the AuthInfo name the context
// references" rather than passing by coincidence if the two were equal.
func writeTestKubeconfig(t *testing.T, contextName, authInfoName string) string {
	t.Helper()
	cfg := clientcmdapi.NewConfig()
	cfg.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://example.invalid"}
	cfg.AuthInfos[authInfoName] = &clientcmdapi.AuthInfo{}
	cfg.Contexts[contextName] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: authInfoName}
	cfg.CurrentContext = contextName

	path := filepath.Join(t.TempDir(), "kubeconfig.yaml")
	if err := clientcmd.WriteToFile(*cfg, path); err != nil {
		t.Fatalf("WriteToFile: %v", err)
	}
	return path
}

func TestResolveIdentity_KubeUserIsTheAuthInfoName(t *testing.T) {
	path := writeTestKubeconfig(t, "prod-us-east", "arn:aws:eks:us-east-1:123456789012:cluster/prod")

	kubeUser, certCN := ResolveIdentity(path, "prod-us-east", nil)
	if kubeUser != "arn:aws:eks:us-east-1:123456789012:cluster/prod" {
		t.Errorf("expected kubeUser to be the AuthInfo name, got %q", kubeUser)
	}
	if certCN != "" {
		t.Errorf("expected empty certCN with no client-cert config, got %q", certCN)
	}
}

func TestResolveIdentity_UnknownContextReturnsEmpty(t *testing.T) {
	path := writeTestKubeconfig(t, "prod-us-east", "some-user")
	kubeUser, _ := ResolveIdentity(path, "does-not-exist", nil)
	if kubeUser != "" {
		t.Errorf("expected empty kubeUser for an unknown context, got %q", kubeUser)
	}
}

func TestResolveIdentity_MissingKubeconfigReturnsEmpty(t *testing.T) {
	kubeUser, certCN := ResolveIdentity(filepath.Join(t.TempDir(), "nope.yaml"), "any-context", nil)
	if kubeUser != "" || certCN != "" {
		t.Errorf("expected both empty for a missing kubeconfig, got kubeUser=%q certCN=%q", kubeUser, certCN)
	}
}

func TestResolveIdentity_CacheReparsesWhenKubeconfigChanges(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "kubeconfig.yaml")

	writeKubeconfigAt(t, path, "ctx", "user-one")
	if got, _ := ResolveIdentity(path, "ctx", nil); got != "user-one" {
		t.Fatalf("first resolve: want user-one, got %q", got)
	}

	// Rewrite the same path with a different-length AuthInfo so the cached
	// entry is invalidated by the size change (robust even on filesystems
	// with coarse mod-time granularity).
	writeKubeconfigAt(t, path, "ctx", "user-number-two")
	if got, _ := ResolveIdentity(path, "ctx", nil); got != "user-number-two" {
		t.Errorf("after change: want user-number-two (cache should reparse), got %q", got)
	}
}

// writeKubeconfigAt writes a minimal kubeconfig to an explicit path (unlike
// writeTestKubeconfig, which always uses a fresh temp path), so a test can
// overwrite the same file and exercise cache invalidation.
func writeKubeconfigAt(t *testing.T, path, contextName, authInfoName string) {
	t.Helper()
	cfg := clientcmdapi.NewConfig()
	cfg.Clusters["test-cluster"] = &clientcmdapi.Cluster{Server: "https://example.invalid"}
	cfg.AuthInfos[authInfoName] = &clientcmdapi.AuthInfo{}
	cfg.Contexts[contextName] = &clientcmdapi.Context{Cluster: "test-cluster", AuthInfo: authInfoName}
	cfg.CurrentContext = contextName
	if err := clientcmd.WriteToFile(*cfg, path); err != nil {
		t.Fatalf("WriteToFile: %v", err)
	}
}

func TestResolveIdentity_ClientCertCommonName(t *testing.T) {
	certPEM := generateSelfSignedCertPEM(t, "test-client-identity")
	cfg := &rest.Config{
		TLSClientConfig: rest.TLSClientConfig{CertData: certPEM},
	}

	_, certCN := ResolveIdentity("", "irrelevant", cfg)
	if certCN != "test-client-identity" {
		t.Errorf("expected certCN %q, got %q", "test-client-identity", certCN)
	}
}

// generateSelfSignedCertPEM builds a throwaway self-signed certificate with
// the given Subject Common Name, PEM-encoded, for exercising cert-CN
// extraction without a real cluster.
func generateSelfSignedCertPEM(t *testing.T, commonName string) []byte {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: commonName},
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("CreateCertificate: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}
