package audit

import (
	"crypto/x509"
	"encoding/pem"
	"os"
	"sync"
	"time"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/podscape/go-core/internal/client"
)

// kubeconfigUserCache memoizes the context->user (AuthInfo) mapping parsed
// from a kubeconfig file, keyed by path. ResolveIdentity runs in the request
// path of every mutating action, so re-reading and YAML-parsing the whole
// kubeconfig each time is wasteful. A cheap os.Stat guards the cache: the
// mapping only changes when the file does, so an unchanged mod time + size
// serves the cached map and skips the parse entirely.
var (
	kubeconfigUserCacheMu sync.Mutex
	kubeconfigUserCache   = map[string]kubeconfigUserEntry{}
)

type kubeconfigUserEntry struct {
	modTime time.Time
	size    int64
	users   map[string]string // context name -> AuthInfo (kubeconfig user)
}

// kubeconfigUser returns the AuthInfo (user) that contextName maps to in the
// kubeconfig at path, caching the parsed mapping and reparsing only when the
// file's mod time or size changes. Any failure (missing file, parse error,
// unknown context) yields "".
func kubeconfigUser(path, contextName string) string {
	fi, err := os.Stat(path)
	if err != nil {
		return ""
	}

	kubeconfigUserCacheMu.Lock()
	defer kubeconfigUserCacheMu.Unlock()

	ent, ok := kubeconfigUserCache[path]
	if !ok || !ent.modTime.Equal(fi.ModTime()) || ent.size != fi.Size() {
		data, err := clientcmd.LoadFromFile(path)
		if err != nil {
			return ""
		}
		users := make(map[string]string, len(data.Contexts))
		for name, kctx := range data.Contexts {
			users[name] = kctx.AuthInfo
		}
		ent = kubeconfigUserEntry{modTime: fi.ModTime(), size: fi.Size(), users: users}
		kubeconfigUserCache[path] = ent
	}
	return ent.users[contextName]
}

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
	return kubeconfigUser(path, contextName), certCommonName(cfg)
}

func certCommonName(cfg *rest.Config) string {
	if cfg == nil {
		return ""
	}
	certData := cfg.CertData
	if len(certData) == 0 && cfg.CertFile != "" {
		data, err := os.ReadFile(cfg.CertFile)
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
