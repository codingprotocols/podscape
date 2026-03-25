# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| < 2.0   | No        |

## Reporting a Vulnerability

Podscape has deep access to Kubernetes clusters — it reads secrets, execs into containers, streams logs, and applies manifests. We take security reports seriously.

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report them privately via one of these channels:

- **GitHub Private Vulnerability Reporting** — use the [Report a vulnerability](https://github.com/codingprotocols/podscape/security/advisories/new) button on the Security tab
- **Email** — [support@codingprotocols.com](mailto:support@codingprotocols.com) with the subject line `[SECURITY] Podscape`

### What to include

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional but appreciated)

### What to expect

- Acknowledgement within **48 hours**
- A status update within **7 days**
- Credit in the release notes if you'd like

## Security design notes

- The Go sidecar binds exclusively to `127.0.0.1` — it is never exposed on a network interface
- Every sidecar request (except `/health`) requires an `X-Podscape-Token` header set to a randomly generated token at launch
- Secret values are masked server-side — only keys are returned to the renderer; individual values require an explicit reveal action
- The app does not phone home, collect telemetry, or transmit cluster data to any external service
