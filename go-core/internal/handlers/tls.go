package handlers

import (
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"time"

	corev1 "k8s.io/api/core/v1"

	"github.com/podscape/go-core/internal/store"
)

// TLSCertInfo holds parsed TLS certificate metadata for a Kubernetes TLS secret.
type TLSCertInfo struct {
	SecretName     string    `json:"secretName"`
	Namespace      string    `json:"namespace"`
	CommonName     string    `json:"commonName"`
	DNSNames       []string  `json:"dnsNames"`
	Issuer         string    `json:"issuer"`
	NotBefore      time.Time `json:"notBefore"`
	NotAfter       time.Time `json:"notAfter"`
	DaysLeft       int       `json:"daysLeft"`
	IsExpired      bool      `json:"isExpired"`
	IsExpiringSoon bool      `json:"isExpiringSoon"` // within 30 days
	Error          string    `json:"error,omitempty"`
}

func HandleTLSCerts(w http.ResponseWriter, r *http.Request) {
	store.Store.RLock()
	c := store.Store.ActiveCache
	store.Store.RUnlock()
	if c == nil {
		http.Error(w, "cluster not connected", http.StatusServiceUnavailable)
		return
	}

	ns := r.URL.Query().Get("namespace")
	var certs []TLSCertInfo

	c.RLock()
	secrets := make(map[string]interface{}, len(c.Secrets))
	for k, v := range c.Secrets {
		secrets[k] = v
	}
	c.RUnlock()

	for _, raw := range secrets {
		secret, ok := raw.(*corev1.Secret)
		if !ok {
			continue
		}
		if ns != "" && secret.Namespace != ns {
			continue
		}
		if secret.Type != "kubernetes.io/tls" {
			continue
		}

		info := TLSCertInfo{
			SecretName: secret.Name,
			Namespace:  secret.Namespace,
		}

		certData, ok := secret.Data["tls.crt"]
		if !ok || len(certData) == 0 {
			info.Error = "missing tls.crt"
			certs = append(certs, info)
			continue
		}

		// Attempt PEM decode; fall back to base64 then PEM
		var certBytes []byte
		if block, _ := pem.Decode(certData); block != nil {
			certBytes = certData
		} else {
			decoded, err := base64.StdEncoding.DecodeString(string(certData))
			if err == nil {
				certBytes = decoded
			} else {
				certBytes = certData
			}
		}

		block, _ := pem.Decode(certBytes)
		if block == nil {
			info.Error = "invalid PEM"
			certs = append(certs, info)
			continue
		}

		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			info.Error = "parse error: " + err.Error()
			certs = append(certs, info)
			continue
		}

		daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
		info.CommonName = cert.Subject.CommonName
		info.DNSNames = cert.DNSNames
		info.Issuer = cert.Issuer.CommonName
		info.NotBefore = cert.NotBefore
		info.NotAfter = cert.NotAfter
		info.DaysLeft = daysLeft
		info.IsExpired = daysLeft < 0
		info.IsExpiringSoon = daysLeft >= 0 && daysLeft <= 30

		certs = append(certs, info)
	}

	if certs == nil {
		certs = []TLSCertInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(certs)
}
