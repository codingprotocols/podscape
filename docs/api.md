# 🔌 API Reference (Go Sidecar)

The Go sidecar provides an HTTP API on `localhost:5050` (by default). The Renderer process consumes these endpoints to display cluster information.

## 🟢 Core Endpoints

### `GET /health`
Returns the health status of the sidecar and Kubernetes connection.
- **Response**: `200 OK`

### `GET /context`
Returns the current active Kubernetes context.

### `GET /namespaces`
Returns a list of all namespaces in the cluster.

### `GET /resources?kind=<Kind>&namespace=<Namespace>`
Generic endpoint to fetch any Kubernetes resource list. 
- **Informers**: This endpoint reads from a high-speed in-memory cache.

---

## 🛡️ Security Endpoints

### `POST /security/scan`
Triggers a full security audit across the cluster.
- **Headers**: `Accept: text/event-stream` (SSE)
- **Events**:
  - `progress`: Real-time scan logs.
  - `result`: The final unified JSON report.

### `POST /security/kubesec/batch`
Runs a batch configuration audit on multiple resources.
- **Body**: JSON array of Kubernetes resource objects.
- **Response**: Array of scoring results.

---

## ⚡ Real-time (WebSockets)

### `ws:///logs`
Streams real-time container logs.

### `ws:///exec`
Provides an interactive shell into a container (used by the Terminal component).

### `ws:///portforward`
Manages and monitors active port-forwarding tunnels.
