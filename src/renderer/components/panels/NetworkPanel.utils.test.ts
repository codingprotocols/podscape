import { describe, it, expect } from 'vitest'
import { edgeStyle, computePolicyHulls } from './NetworkPanel.utils'

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

import type { Graph } from './NetworkPanel.utils'

// Collapse logic moved to Go sidecar — see go-core/internal/topology/topology.go
// and TestBuildTopology_MultipleRSes_Collapsed for Go-side coverage.

function makeGraph(overrides: Partial<Graph> = {}): Graph {
  return { nodes: [], edges: [], namespaces: [], ...overrides }
}

describe('computePolicyHulls', () => {
  const NODE_W = 164
  const NODE_H = 54
  const HULL_PAD = 28

  it('returns empty array when no policies', () => {
    const g = makeGraph({ nodes: [], edges: [] })
    expect(computePolicyHulls(g, new Map(), NODE_W, NODE_H)).toHaveLength(0)
  })

  it('returns empty array for a policy with no governed pods', () => {
    const g = makeGraph({
      nodes: [{ id: 'pol:ns:deny-all', kind: 'policy', name: 'deny-all', namespace: 'ns' }],
      edges: [],
    })
    expect(computePolicyHulls(g, new Map(), NODE_W, NODE_H)).toHaveLength(0)
  })

  it('returns hull for a policy governing one pod', () => {
    const g = makeGraph({
      nodes: [
        { id: 'pol:ns:allow', kind: 'policy', name: 'allow', namespace: 'ns' },
        { id: 'pod:uid1', kind: 'pod', name: 'web-abc', namespace: 'ns' },
      ],
      edges: [{ id: 'e1', source: 'pol:ns:allow', target: 'pod:uid1', kind: 'policy-pod' }],
    })
    const positions = new Map([
      ['pod:uid1', { x: 100, y: 200 }],
    ])
    const hulls = computePolicyHulls(g, positions, NODE_W, NODE_H)
    expect(hulls).toHaveLength(1)
    expect(hulls[0].policyId).toBe('pol:ns:allow')
    expect(hulls[0].rect.x).toBe(100 - NODE_W / 2 - HULL_PAD)
    expect(hulls[0].rect.y).toBe(200 - NODE_H / 2 - HULL_PAD)
  })

  it('hull spans across multiple pods', () => {
    const g = makeGraph({
      nodes: [
        { id: 'pol:ns:policy1', kind: 'policy', name: 'policy1', namespace: 'ns' },
        { id: 'pod:uid1', kind: 'pod', name: 'a', namespace: 'ns' },
        { id: 'pod:uid2', kind: 'pod', name: 'b', namespace: 'ns' },
      ],
      edges: [
        { id: 'e1', source: 'pol:ns:policy1', target: 'pod:uid1', kind: 'policy-pod' },
        { id: 'e2', source: 'pol:ns:policy1', target: 'pod:uid2', kind: 'policy-pod' },
      ],
    })
    const positions = new Map([
      ['pod:uid1', { x: 0, y: 100 }],
      ['pod:uid2', { x: 400, y: 100 }],
    ])
    const hulls = computePolicyHulls(g, positions, NODE_W, NODE_H)
    expect(hulls[0].rect.w).toBeGreaterThan(400)
  })

  it('skips policy edges where pod has no position (filtered out)', () => {
    const g = makeGraph({
      nodes: [
        { id: 'pol:ns:p', kind: 'policy', name: 'p', namespace: 'ns' },
        { id: 'pod:uid1', kind: 'pod', name: 'a', namespace: 'ns' },
      ],
      edges: [{ id: 'e1', source: 'pol:ns:p', target: 'pod:uid1', kind: 'policy-pod' }],
    })
    const hulls = computePolicyHulls(g, new Map(), NODE_W, NODE_H)
    expect(hulls).toHaveLength(0)
  })
})
