// Actual port the Go sidecar is listening on.
// Set by sidecar.ts before the binary is spawned; read by api.ts and kubectl.ts.
export let activeSidecarPort: number = 5050

export function setActiveSidecarPort(port: number): void {
  activeSidecarPort = port
}
