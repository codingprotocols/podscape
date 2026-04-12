import { describe, it, expect } from 'vitest'
import { edgeStyle } from './NetworkPanel.utils'

describe('edgeStyle', () => {
  it('classifies ing-svc as traffic', () => {
    expect(edgeStyle('ing-svc').class).toBe('traffic')
  })
  it('classifies svc-pod as traffic', () => {
    expect(edgeStyle('svc-pod').class).toBe('traffic')
  })
  it('classifies controller-pod as infra', () => {
    expect(edgeStyle('controller-pod').class).toBe('infra')
  })
  it('classifies controller-workload as infra', () => {
    expect(edgeStyle('controller-workload').class).toBe('infra')
  })
  it('classifies pod-node as infra', () => {
    expect(edgeStyle('pod-node').class).toBe('infra')
  })
  it('classifies pod-pvc as infra', () => {
    expect(edgeStyle('pod-pvc').class).toBe('infra')
  })
  it('classifies policy-pod as policy', () => {
    expect(edgeStyle('policy-pod').class).toBe('policy')
  })
  it('classifies pol-ingress as policy', () => {
    expect(edgeStyle('pol-ingress').class).toBe('policy')
  })
  it('classifies pol-egress as policy', () => {
    expect(edgeStyle('pol-egress').class).toBe('policy')
  })
})
