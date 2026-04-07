import { ObjectMeta } from './common'

// ─── Context / Config ─────────────────────────────────────────────────────────

export interface KubeContextEntry {
  name: string
  context: { cluster: string; user: string; namespace?: string }
}

// ─── Port Forward ─────────────────────────────────────────────────────────────

export interface PortForwardEntry {
  id: string
  type: 'pod' | 'service'
  namespace: string
  name: string
  localPort: number
  remotePort: number
  status: 'starting' | 'active' | 'error' | 'stopped'
  error?: string
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface NodeMetrics {
  metadata: ObjectMeta
  timestamp: string
  window: string
  usage: { cpu: string; memory: string }
}

export interface PodMetrics {
  metadata: ObjectMeta
  timestamp: string
  window: string
  containers: Array<{ name: string; usage: { cpu: string; memory: string } }>
}

// ─── Helm ─────────────────────────────────────────────────────────────────────

export interface HelmRelease {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
}

export interface HelmHistoryEntry {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}

// ─── Owner Chain ──────────────────────────────────────────────────────────────

export interface OwnerRef {
  kind: string
  name: string
  namespace: string
  uid: string
  found: boolean
}

export interface OwnerChainResponse {
  ancestors: OwnerRef[]
  descendants: Record<string, OwnerRef[]>
}

// ─── Debug Pod ────────────────────────────────────────────────────────────────

export interface DebugPodEntry {
  name: string
  namespace: string
  image: string
  imageLabel: string
  launchedAt: Date
  status: 'creating' | 'running' | 'error'
  error?: string
}

// ─── Provider detection ───────────────────────────────────────────────────────

export interface ProviderSet {
  istio: boolean
  istioVersion?: string
  traefik: boolean
  traefikVersion?: string // "v2" | "v3"
  nginxInc: boolean       // kubernetes-ingress (NGINX Inc, CRD-based)
  nginxCommunity: boolean // ingress-nginx (community, annotation-based)
}
