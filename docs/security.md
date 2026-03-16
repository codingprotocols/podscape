# 🛡️ Security Hub Implementation

The Security Hub provides a unified interface for auditing cluster security, combining multiple scanning engines into a single dashboard.

## 1. Static Configuration Analysis (Kubesec)
- **Engine**: [Kubesec.io](https://kubesec.io/)
- **Implementation**: Integrated as a Go package within the sidecar handlers.
- **Features**:
  - High-performance batch scanning of cluster resources.
  - Worker pools (default 8 workers) for concurrent processing.
  - Normalization of Kubesec scores into "Critical", "Warning", and "Info" levels.

## 2. Dynamic Image Vulnerability Scanning (Trivy)
- **Engine**: [Aqua Security Trivy](https://github.com/aquasecurity/trivy)
- **Integration**: Invoked via `os/exec` from the Go sidecar to ensure library portability and avoid dependency hell.
- **SSE Streaming**: Scan progress is streamed back to the UI in real-time using Server-Sent Events (SSE), allowing users to see granular terminal output for long-running scans.
- **Intelligent Deduplication**: The backend deduplicates images across the cluster to ensure each unique image tag is only scanned once, saving significant time and compute resources.

## 3. UI Features
- **Namespace Grouping**: Toggle between a flat list of issues and a grouped-by-namespace view.
- **System Filtering**: Automatic exclusion of system namespaces (`kube-system`, `kube-node-lease`, etc.) to reduce noise, with a toggle to reveal them if needed.
- **Severity Filtering**: Tabs for filtering results by "Critical" and "Warning" status.
- **Export**: Ability to export filtered results as **CSV** or **JSON** for external reporting.
