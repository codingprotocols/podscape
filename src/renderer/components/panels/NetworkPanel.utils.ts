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

// ─── Pod replica collapse ─────────────────────────────────────────────────────

export function collapsePodReplicas(graph: Graph, expandedWorkloads: Set<string>): Graph {
  // Build workload → owned pod IDs map from controller-pod edges
  const workloadPods = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (edge.kind !== 'controller-pod') continue
    if (!workloadPods.has(edge.source)) workloadPods.set(edge.source, [])
    workloadPods.get(edge.source)!.push(edge.target)
  }

  // Determine which pods collapse and what their group node ID is
  const collapsedPodIds = new Set<string>()
  const podGroupNodes: GraphNode[] = []
  const podToGroup = new Map<string, string>()  // old podId → groupNodeId

  for (const [workloadId, podIds] of workloadPods) {
    if (expandedWorkloads.has(workloadId)) continue
    const workloadNode = graph.nodes.find(n => n.id === workloadId)
    if (!workloadNode) continue

    const groupId = `podgroup:${workloadId}`
    podGroupNodes.push({
      id: groupId,
      kind: 'pod',
      name: `${workloadNode.name}-*`,
      namespace: workloadNode.namespace,
      replicaCount: podIds.length,
    })
    for (const podId of podIds) {
      collapsedPodIds.add(podId)
      podToGroup.set(podId, groupId)
    }
  }

  // Filter nodes: remove collapsed pods, add group nodes
  const nodes: GraphNode[] = [
    ...graph.nodes.filter(n => !collapsedPodIds.has(n.id)),
    ...podGroupNodes,
  ]

  // Redirect and deduplicate edges
  const edgeMap = new Map<string, GraphEdge>()
  for (const edge of graph.edges) {
    // Drop controller-pod edges to collapsed pods
    if (edge.kind === 'controller-pod' && collapsedPodIds.has(edge.target)) continue

    const newSource = podToGroup.get(edge.source) ?? edge.source
    const newTarget = podToGroup.get(edge.target) ?? edge.target
    const dedupeKey = `${edge.kind}--${newSource}--${newTarget}`

    if (!edgeMap.has(dedupeKey)) {
      edgeMap.set(dedupeKey, {
        ...edge,
        id: `${edge.kind}::${newSource}::${newTarget}`,
        source: newSource,
        target: newTarget,
      })
    }
  }

  return { nodes, edges: Array.from(edgeMap.values()), namespaces: graph.namespaces }
}

// ─── Workload replica collapse (e.g. old ReplicaSets under a Deployment) ──────

export function collapseWorkloadReplicas(graph: Graph, expandedControllers: Set<string>): Graph {
  // Build parent → owned child workload IDs map from controller-workload edges
  const parentChildren = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (edge.kind !== 'controller-workload') continue
    if (!parentChildren.has(edge.source)) parentChildren.set(edge.source, [])
    parentChildren.get(edge.source)!.push(edge.target)
  }

  // Only collapse when there are >= 2 owned workloads and parent is not expanded
  const collapsedWorkloadIds = new Set<string>()
  const workloadGroupNodes: GraphNode[] = []
  const workloadToGroup = new Map<string, string>()  // old workloadId → groupNodeId

  for (const [parentId, childIds] of parentChildren) {
    if (expandedControllers.has(parentId) || childIds.length < 2) continue
    const parentNode = graph.nodes.find(n => n.id === parentId)
    if (!parentNode) continue
    const firstChild = graph.nodes.find(n => n.id === childIds[0])

    const groupId = `workloadgroup:${parentId}`
    const childNames = childIds.map(id => graph.nodes.find(n => n.id === id)?.name ?? id)
    workloadGroupNodes.push({
      id: groupId,
      kind: 'workload',
      name: `${parentNode.name}-*`,
      namespace: parentNode.namespace,
      workloadKind: firstChild?.workloadKind,
      replicaCount: childIds.length,
      replicaNames: childNames,
    })
    for (const childId of childIds) {
      collapsedWorkloadIds.add(childId)
      workloadToGroup.set(childId, groupId)
    }
  }

  // Filter nodes: remove collapsed workloads, add group nodes
  const nodes: GraphNode[] = [
    ...graph.nodes.filter(n => !collapsedWorkloadIds.has(n.id)),
    ...workloadGroupNodes,
  ]

  // Redirect and deduplicate edges
  const edgeMap = new Map<string, GraphEdge>()
  for (const edge of graph.edges) {
    const newSource = workloadToGroup.get(edge.source) ?? edge.source
    const newTarget = workloadToGroup.get(edge.target) ?? edge.target
    const dedupeKey = `${edge.kind}--${newSource}--${newTarget}`

    if (!edgeMap.has(dedupeKey)) {
      edgeMap.set(dedupeKey, {
        ...edge,
        id: `${edge.kind}::${newSource}::${newTarget}`,
        source: newSource,
        target: newTarget,
      })
    }
  }

  return { nodes, edges: Array.from(edgeMap.values()), namespaces: graph.namespaces }
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
      .filter((p): p is { x: number; y: number } => p !== undefined)

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
