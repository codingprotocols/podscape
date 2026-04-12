import { describe, it, expect } from 'vitest'
import { edgeStyle } from './NetworkPanel.utils'

describe('edgeStyle', () => {
  it('classifies ing-svc as traffic', () => {
    const result = edgeStyle('ing-svc')
    expect(result.class).toBe('traffic')
    expect(result.color).toBe('#8b5cf6')
    expect(result.dur).toBe('1.5s')
  })
  it('classifies svc-pod as traffic', () => {
    const result = edgeStyle('svc-pod')
    expect(result.class).toBe('traffic')
    expect(result.color).toBe('#3b82f6')
    expect(result.dur).toBe('2.5s')
  })
  it('classifies policy-pod as policy', () => {
    const result = edgeStyle('policy-pod')
    expect(result.class).toBe('policy')
    expect(result.color).toBe('#f472b6')
    expect(result.dur).toBe('2.5s')
  })
  it('classifies pol-ingress as policy', () => {
    const result = edgeStyle('pol-ingress')
    expect(result.class).toBe('policy')
    expect(result.color).toBe('#a78bfa')
    expect(result.dur).toBe('1.8s')
  })
  it('classifies pol-egress as policy', () => {
    const result = edgeStyle('pol-egress')
    expect(result.class).toBe('policy')
    expect(result.color).toBe('#60a5fa')
    expect(result.dur).toBe('1.8s')
  })
  it('classifies pod-pvc as infra', () => {
    const result = edgeStyle('pod-pvc')
    expect(result.class).toBe('infra')
    expect(result.color).toBe('#f87171')
    expect(result.dur).toBe('3.0s')
  })
  it('classifies pod-node as infra', () => {
    const result = edgeStyle('pod-node')
    expect(result.class).toBe('infra')
    expect(result.color).toBe('#06b6d4')
    expect(result.dur).toBe('3.0s')
  })
  it('classifies controller-pod as infra', () => {
    const result = edgeStyle('controller-pod')
    expect(result.class).toBe('infra')
    expect(result.color).toBe('#fbbf24')
    expect(result.dur).toBe('2.0s')
  })
  it('classifies controller-workload as infra', () => {
    const result = edgeStyle('controller-workload')
    expect(result.class).toBe('infra')
    expect(result.color).toBe('#fbbf24')
    expect(result.dur).toBe('2.0s')
  })
})

import { workloadBadgeLabel, workloadIcon } from './NetworkPanel.utils'

describe('workloadBadgeLabel', () => {
  it('returns Deploy for Deployment', () => expect(workloadBadgeLabel('Deployment')).toBe('Deploy'))
  it('returns RS for ReplicaSet', () => expect(workloadBadgeLabel('ReplicaSet')).toBe('RS'))
  it('returns DS for DaemonSet', () => expect(workloadBadgeLabel('DaemonSet')).toBe('DS'))
  it('returns STS for StatefulSet', () => expect(workloadBadgeLabel('StatefulSet')).toBe('STS'))
  it('returns Job for Job', () => expect(workloadBadgeLabel('Job')).toBe('Job'))
  it('returns Cron for CronJob', () => expect(workloadBadgeLabel('CronJob')).toBe('Cron'))
  it('returns workload as fallback', () => expect(workloadBadgeLabel(undefined)).toBe('workload'))
})

describe('workloadIcon', () => {
  it('returns ▣ for Deployment', () => expect(workloadIcon('Deployment')).toBe('▣'))
  it('returns ◫ for ReplicaSet', () => expect(workloadIcon('ReplicaSet')).toBe('◫'))
  it('returns ◉ for DaemonSet', () => expect(workloadIcon('DaemonSet')).toBe('◉'))
  it('returns ⬡ for StatefulSet', () => expect(workloadIcon('StatefulSet')).toBe('⬡'))
  it('returns ▷ for Job', () => expect(workloadIcon('Job')).toBe('▷'))
  it('returns ⏱ for CronJob', () => expect(workloadIcon('CronJob')).toBe('⏱'))
  it('returns ● as fallback', () => expect(workloadIcon(undefined)).toBe('●'))
})

import { collapsePodReplicas } from './NetworkPanel.utils'
import type { Graph } from './NetworkPanel.utils'

function makeGraph(overrides: Partial<Graph> = {}): Graph {
  return { nodes: [], edges: [], namespaces: [], ...overrides }
}

describe('collapsePodReplicas', () => {
  it('returns graph unchanged when no pods', () => {
    const g = makeGraph({ nodes: [{ id: 'svc:ns:foo', kind: 'service', name: 'foo', namespace: 'ns' }] })
    const result = collapsePodReplicas(g, new Set())
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('svc:ns:foo')
  })

  it('does not collapse standalone pods (no owner)', () => {
    const g = makeGraph({
      nodes: [
        { id: 'pod:uid1', kind: 'pod', name: 'pod-1', namespace: 'ns' },
        { id: 'pod:uid2', kind: 'pod', name: 'pod-2', namespace: 'ns' },
      ],
      edges: [],
    })
    const result = collapsePodReplicas(g, new Set())
    expect(result.nodes).toHaveLength(2)
  })

  it('collapses 3 owned pods into 1 pod group node', () => {
    const g = makeGraph({
      nodes: [
        { id: 'workload:ns:Deployment:myapp', kind: 'workload', name: 'myapp', namespace: 'ns', workloadKind: 'Deployment' },
        { id: 'pod:uid1', kind: 'pod', name: 'myapp-abc', namespace: 'ns' },
        { id: 'pod:uid2', kind: 'pod', name: 'myapp-def', namespace: 'ns' },
        { id: 'pod:uid3', kind: 'pod', name: 'myapp-ghi', namespace: 'ns' },
      ],
      edges: [
        { id: 'e1', source: 'workload:ns:Deployment:myapp', target: 'pod:uid1', kind: 'controller-pod' },
        { id: 'e2', source: 'workload:ns:Deployment:myapp', target: 'pod:uid2', kind: 'controller-pod' },
        { id: 'e3', source: 'workload:ns:Deployment:myapp', target: 'pod:uid3', kind: 'controller-pod' },
      ],
    })
    const result = collapsePodReplicas(g, new Set())
    const pods = result.nodes.filter(n => n.kind === 'pod')
    expect(pods).toHaveLength(1)
    expect(pods[0].replicaCount).toBe(3)
    expect(pods[0].name).toBe('myapp-*')
    expect(pods[0].id).toBe('podgroup:workload:ns:Deployment:myapp')
  })

  it('removes controller-pod edges to collapsed pods', () => {
    const g = makeGraph({
      nodes: [
        { id: 'workload:ns:Deployment:myapp', kind: 'workload', name: 'myapp', namespace: 'ns', workloadKind: 'Deployment' },
        { id: 'pod:uid1', kind: 'pod', name: 'myapp-abc', namespace: 'ns' },
      ],
      edges: [
        { id: 'e1', source: 'workload:ns:Deployment:myapp', target: 'pod:uid1', kind: 'controller-pod' },
      ],
    })
    const result = collapsePodReplicas(g, new Set())
    expect(result.edges.filter(e => e.kind === 'controller-pod')).toHaveLength(0)
  })

  it('redirects svc-pod edges to pod group', () => {
    const g = makeGraph({
      nodes: [
        { id: 'workload:ns:Deployment:myapp', kind: 'workload', name: 'myapp', namespace: 'ns', workloadKind: 'Deployment' },
        { id: 'pod:uid1', kind: 'pod', name: 'myapp-abc', namespace: 'ns' },
        { id: 'svc:ns:frontend', kind: 'service', name: 'frontend', namespace: 'ns' },
      ],
      edges: [
        { id: 'e1', source: 'workload:ns:Deployment:myapp', target: 'pod:uid1', kind: 'controller-pod' },
        { id: 'e2', source: 'svc:ns:frontend', target: 'pod:uid1', kind: 'svc-pod' },
      ],
    })
    const result = collapsePodReplicas(g, new Set())
    const svcEdge = result.edges.find(e => e.kind === 'svc-pod')
    expect(svcEdge).toBeDefined()
    expect(svcEdge!.target).toBe('podgroup:workload:ns:Deployment:myapp')
  })

  it('does not collapse pods whose workload is in expandedWorkloads', () => {
    const workloadId = 'workload:ns:Deployment:myapp'
    const g = makeGraph({
      nodes: [
        { id: workloadId, kind: 'workload', name: 'myapp', namespace: 'ns', workloadKind: 'Deployment' },
        { id: 'pod:uid1', kind: 'pod', name: 'myapp-abc', namespace: 'ns' },
        { id: 'pod:uid2', kind: 'pod', name: 'myapp-def', namespace: 'ns' },
      ],
      edges: [
        { id: 'e1', source: workloadId, target: 'pod:uid1', kind: 'controller-pod' },
        { id: 'e2', source: workloadId, target: 'pod:uid2', kind: 'controller-pod' },
      ],
    })
    const result = collapsePodReplicas(g, new Set([workloadId]))
    expect(result.nodes.filter(n => n.kind === 'pod')).toHaveLength(2)
  })

  it('ignores controller-pod edges whose workload node is absent from the graph', () => {
    const g = makeGraph({
      nodes: [{ id: 'pod:uid1', kind: 'pod', name: 'orphan', namespace: 'ns' }],
      edges: [{ id: 'e1', source: 'workload:ns:Deployment:ghost', target: 'pod:uid1', kind: 'controller-pod' }],
    })
    const result = collapsePodReplicas(g, new Set())
    // pod should remain uncollapsed because the workload node is missing
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('pod:uid1')
  })

  it('redirects pod-pvc edges where the collapsed pod is the source', () => {
    const g = makeGraph({
      nodes: [
        { id: 'workload:ns:Deployment:myapp', kind: 'workload', name: 'myapp', namespace: 'ns', workloadKind: 'Deployment' },
        { id: 'pod:uid1', kind: 'pod', name: 'myapp-abc', namespace: 'ns' },
        { id: 'pvc:ns:data', kind: 'pvc', name: 'data', namespace: 'ns' },
      ],
      edges: [
        { id: 'e1', source: 'workload:ns:Deployment:myapp', target: 'pod:uid1', kind: 'controller-pod' },
        { id: 'e2', source: 'pod:uid1', target: 'pvc:ns:data', kind: 'pod-pvc' },
      ],
    })
    const result = collapsePodReplicas(g, new Set())
    const pvcEdge = result.edges.find(e => e.kind === 'pod-pvc')
    expect(pvcEdge).toBeDefined()
    expect(pvcEdge!.source).toBe('podgroup:workload:ns:Deployment:myapp')
    expect(pvcEdge!.target).toBe('pvc:ns:data')
  })

  it('deduplicates redirected edges', () => {
    const g = makeGraph({
      nodes: [
        { id: 'workload:ns:Deployment:myapp', kind: 'workload', name: 'myapp', namespace: 'ns', workloadKind: 'Deployment' },
        { id: 'pod:uid1', kind: 'pod', name: 'myapp-abc', namespace: 'ns' },
        { id: 'pod:uid2', kind: 'pod', name: 'myapp-def', namespace: 'ns' },
        { id: 'svc:ns:frontend', kind: 'service', name: 'frontend', namespace: 'ns' },
      ],
      edges: [
        { id: 'e1', source: 'workload:ns:Deployment:myapp', target: 'pod:uid1', kind: 'controller-pod' },
        { id: 'e2', source: 'workload:ns:Deployment:myapp', target: 'pod:uid2', kind: 'controller-pod' },
        { id: 'e3', source: 'svc:ns:frontend', target: 'pod:uid1', kind: 'svc-pod' },
        { id: 'e4', source: 'svc:ns:frontend', target: 'pod:uid2', kind: 'svc-pod' },
      ],
    })
    const result = collapsePodReplicas(g, new Set())
    const svcEdges = result.edges.filter(e => e.kind === 'svc-pod')
    expect(svcEdges).toHaveLength(1)  // deduplicated
  })
})
