package urlutil_test

import (
	"net/url"
	"testing"

	"github.com/podscape/go-core/internal/urlutil"
)

func TestParse(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
		// expected fields on success
		scheme string
		host   string
		path   string
	}{
		{name: "empty", input: "", wantErr: true},
		{name: "whitespace only", input: "   ", wantErr: true},
		{name: "tab control char", input: "http://host\t/path", wantErr: true},
		{name: "newline control char", input: "http://host\n/path", wantErr: true},
		{name: "ftp scheme rejected", input: "ftp://host/path", wantErr: true},
		{name: "file scheme rejected", input: "file:///etc/passwd", wantErr: true},
		{name: "no host", input: "http:///path", wantErr: true},
		// userinfo is dropped by url.Parse into parsed.User, not parsed.Host,
		// so the @ guard in Parse does not trigger — credentials are silently
		// stripped from the returned struct (only Scheme/Host/Path are kept).
		{
			name: "userinfo silently stripped",
			input: "http://user@host/path",
			scheme: "http", host: "host", path: "/path",
		},

		{
			name: "plain host no scheme",
			input: "myhost:9090",
			scheme: "http", host: "myhost:9090", path: "",
		},
		{
			name: "http URL",
			input: "http://prometheus.svc:9090",
			scheme: "http", host: "prometheus.svc:9090", path: "",
		},
		{
			name: "https URL",
			input: "https://prometheus.example.com",
			scheme: "https", host: "prometheus.example.com", path: "",
		},
		{
			name: "trailing slash stripped",
			input: "http://host:9090/",
			scheme: "http", host: "host:9090", path: "",
		},
		{
			name: "multiple trailing slashes stripped",
			input: "http://host:9090/api//",
			scheme: "http", host: "host:9090", path: "/api",
		},
		{
			name: "localhost rewritten to 127.0.0.1",
			input: "http://localhost:9090",
			scheme: "http", host: "127.0.0.1:9090", path: "",
		},
		{
			name: "localhost without port rewritten",
			input: "http://localhost",
			scheme: "http", host: "127.0.0.1", path: "",
		},
		{
			name: "with path",
			input: "http://host:9090/api/v1",
			scheme: "http", host: "host:9090", path: "/api/v1",
		},
		{
			name: "leading whitespace trimmed",
			input: "  http://host:9090  ",
			scheme: "http", host: "host:9090", path: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := urlutil.Parse(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Errorf("Parse(%q) = %v, want error", tc.input, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Parse(%q) unexpected error: %v", tc.input, err)
			}
			if got.Scheme != tc.scheme {
				t.Errorf("Scheme = %q, want %q", got.Scheme, tc.scheme)
			}
			if got.Host != tc.host {
				t.Errorf("Host = %q, want %q", got.Host, tc.host)
			}
			if got.Path != tc.path {
				t.Errorf("Path = %q, want %q", got.Path, tc.path)
			}
		})
	}
}

// TestParse_ReturnsSafeStruct verifies the returned struct is built from parsed
// fields, not from the raw input string (CodeQL request-forgery guard).
func TestParse_ReturnsSafeStruct(t *testing.T) {
	got, err := urlutil.Parse("http://host:9090/path")
	if err != nil {
		t.Fatal(err)
	}
	// RawPath and RawQuery must be empty — callers use Build() for query params
	if got.RawQuery != "" {
		t.Errorf("RawQuery = %q, want empty", got.RawQuery)
	}
	if got.Fragment != "" {
		t.Errorf("Fragment = %q, want empty", got.Fragment)
	}
}

func TestBuild(t *testing.T) {
	base := &url.URL{Scheme: "http", Host: "host:9090", Path: "/api"}

	t.Run("no query", func(t *testing.T) {
		got := urlutil.Build(base, "/v1/query", nil)
		want := "http://host:9090/api/v1/query"
		if got != want {
			t.Errorf("Build = %q, want %q", got, want)
		}
	})

	t.Run("with query", func(t *testing.T) {
		q := url.Values{"query": {"up"}, "time": {"1234"}}
		got := urlutil.Build(base, "/v1/query", q)
		// parse and compare to avoid map iteration order dependency
		u, err := url.Parse(got)
		if err != nil {
			t.Fatal(err)
		}
		if u.Host != "host:9090" {
			t.Errorf("Host = %q", u.Host)
		}
		if u.Query().Get("query") != "up" {
			t.Errorf("query param missing")
		}
	})

	t.Run("base path trailing slash deduplication", func(t *testing.T) {
		baseSlash := &url.URL{Scheme: "http", Host: "host", Path: "/api/"}
		got := urlutil.Build(baseSlash, "/v1", nil)
		want := "http://host/api/v1"
		if got != want {
			t.Errorf("Build = %q, want %q", got, want)
		}
	})
}
