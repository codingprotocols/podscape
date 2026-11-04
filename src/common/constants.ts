export const SIDECAR_HOST = '127.0.0.1'
export const SIDECAR_PORT = 5050

export interface RolloutRevision {
  revision: number
  current: boolean
  age: string
  images: string[]
  desired: number
  ready: number
}

// Mirrors go-core/internal/audit.Event's JSON shape exactly (field-for-field).
export interface AuditLogEntry {
  seq: number
  timestamp: string
  action: string
  kube_context: string
  kube_user: string
  kube_client_cert_cn: string
  os_user: string
  namespace: string
  resource_kind: string
  resource_name: string
  params: Record<string, unknown>
  outcome: 'success' | 'failure'
  error: string
  duration_ms: number
  prev_hash: string
  hash: string
}
