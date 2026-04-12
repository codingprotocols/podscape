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
