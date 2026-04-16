// ─── Shared types ────────────────────────────────────────────────────────────

export type NodeKind = 'ingress' | 'service' | 'pod' | 'policy' | 'workload' | 'pvc' | 'node'
export type EdgeKind = 'ing-svc' | 'svc-pod' | 'policy-pod' | 'pol-ingress' | 'pol-egress' | 'pod-pvc' | 'pod-node' | 'controller-pod' | 'controller-workload'
export type EdgeClass = 'traffic' | 'infra' | 'policy'

export interface GraphNode {
  id: string
  kind: NodeKind
  name: string
  namespace: string
  phase?: string
  serviceType?: string
  ports?: string[]
  workloadKind?: string
  replicaCount?: number   // present on group nodes
  replicaNames?: string[] // individual names of grouped replicas
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: EdgeKind
  label?: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  namespaces: string[]
}

export interface EdgeStyleResult {
  color: string
  dur: string
  class: EdgeClass
}

export interface PolicyHull {
  policyId: string
  policyNode: GraphNode
  rect: { x: number; y: number; w: number; h: number }
}

// ─── Edge style ───────────────────────────────────────────────────────────────

export function edgeStyle(kind: EdgeKind): EdgeStyleResult {
  switch (kind) {
    case 'ing-svc':             return { color: '#8b5cf6', dur: '1.5s', class: 'traffic' }
    case 'svc-pod':             return { color: '#3b82f6', dur: '2.5s', class: 'traffic' }
    case 'policy-pod':          return { color: '#f472b6', dur: '2.5s', class: 'policy' }
    case 'pol-ingress':         return { color: '#a78bfa', dur: '1.8s', class: 'policy' }
    case 'pol-egress':          return { color: '#60a5fa', dur: '1.8s', class: 'policy' }
    case 'pod-pvc':             return { color: '#f87171', dur: '3.0s', class: 'infra' }
    case 'pod-node':            return { color: '#06b6d4', dur: '3.0s', class: 'infra' }
    case 'controller-pod':      return { color: '#fbbf24', dur: '2.0s', class: 'infra' }
    case 'controller-workload': return { color: '#fbbf24', dur: '2.0s', class: 'infra' }
  }
}

// ─── Workload display helpers ─────────────────────────────────────────────────

const WORKLOAD_BADGE: Record<string, string> = {
  Deployment: 'Deploy',
  ReplicaSet: 'RS',
  DaemonSet: 'DS',
  StatefulSet: 'STS',
  Job: 'Job',
  CronJob: 'Cron',
}

const WORKLOAD_ICON: Record<string, string> = {
  Deployment: '▣',
  ReplicaSet: '◫',
  DaemonSet: '◉',
  StatefulSet: '⬡',
  Job: '▷',
  CronJob: '⏱',
}

export function workloadBadgeLabel(workloadKind: string | undefined): string {
  return (workloadKind && WORKLOAD_BADGE[workloadKind]) ?? 'workload'
}

export function workloadIcon(workloadKind: string | undefined): string {
  return (workloadKind && WORKLOAD_ICON[workloadKind]) ?? '●'
}

// ─── Policy hull computation ──────────────────────────────────────────────────

const HULL_PAD = 28

export function computePolicyHulls(
  graph: Graph,
  positions: Map<string, { x: number; y: number }>,
  nodeW: number,
  nodeH: number
): PolicyHull[] {
  const hulls: PolicyHull[] = []

  for (const policyNode of graph.nodes.filter(n => n.kind === 'policy')) {
    const governedPodPositions = graph.edges
      .filter(e => e.source === policyNode.id && e.kind === 'policy-pod')
      .map(e => positions.get(e.target))
      .filter(
        (p): p is { x: number; y: number } =>
          p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y)
      )

    if (governedPodPositions.length === 0) continue

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of governedPodPositions) {
      minX = Math.min(minX, p.x - nodeW / 2)
      maxX = Math.max(maxX, p.x + nodeW / 2)
      minY = Math.min(minY, p.y - nodeH / 2)
      maxY = Math.max(maxY, p.y + nodeH / 2)
    }

    hulls.push({
      policyId: policyNode.id,
      policyNode,
      rect: {
        x: minX - HULL_PAD,
        y: minY - HULL_PAD,
        w: maxX - minX + HULL_PAD * 2,
        h: maxY - minY + HULL_PAD * 2,
      },
    })
  }

  return hulls
}
