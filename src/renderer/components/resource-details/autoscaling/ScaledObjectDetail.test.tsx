// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
expect.extend(matchers)

vi.mock('../../../store', () => ({
  useAppStore: () => ({ selectedContext: 'test-ctx' }),
}))
vi.mock('../../../hooks/useYAMLEditor', () => ({
  useYAMLEditor: () => ({ yaml: null, loading: false, error: null, open: vi.fn(), apply: vi.fn(), close: vi.fn() }),
}))
vi.mock('lucide-react', () => ({
  FileCode: () => null, X: () => null, Activity: () => null,
}))
vi.mock('../../common/YAMLViewer', () => ({
  default: () => <div data-testid="yaml-viewer" />,
}))

afterEach(cleanup)

function makeResource(overrides: Record<string, unknown> = {}) {
  return {
    metadata: { name: 'my-so', namespace: 'default', uid: 'u1', creationTimestamp: '2024-01-01T00:00:00Z' },
    spec: {
      scaleTargetRef: { kind: 'Deployment', name: 'my-app' },
      minReplicaCount: 1,
      maxReplicaCount: 10,
      triggers: [{ type: 'kafka', metadata: { topic: 'orders', lagThreshold: '50' } }],
    },
    status: {
      currentReplicas: 3,
      conditions: [
        { type: 'Ready',  status: 'True',  reason: 'ScalerReady',  message: 'scaler is ready' },
        { type: 'Active', status: 'True',  reason: 'ScalerActive', message: 'scaler is active' },
        { type: 'Paused', status: 'False', reason: 'NotPaused',    message: 'not paused' },
      ],
    },
    ...overrides,
  }
}

describe('ScaledObjectDetail — status badges', () => {
  it('renders READY badge as green when Ready=True', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    render(<ScaledObjectDetail resource={makeResource()} />)
    const badge = screen.getByTestId('badge-ready')
    expect(badge).toHaveClass('bg-emerald-500/15')
    expect(badge).toHaveClass('text-emerald-400')
  })

  it('renders ACTIVE badge as green when Active=True', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    render(<ScaledObjectDetail resource={makeResource()} />)
    const badge = screen.getByTestId('badge-active')
    expect(badge).toHaveClass('text-emerald-400')
  })

  it('renders PAUSED badge as slate when Paused=False', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    render(<ScaledObjectDetail resource={makeResource()} />)
    const badge = screen.getByTestId('badge-paused')
    expect(badge).toHaveClass('text-slate-500')
  })

  it('renders PAUSED badge as amber when Paused=True', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = makeResource({
      status: {
        currentReplicas: 0,
        conditions: [
          { type: 'Paused', status: 'True', reason: 'Paused', message: 'paused by annotation' },
        ],
      },
    })
    render(<ScaledObjectDetail resource={resource} />)
    const badge = screen.getByTestId('badge-paused')
    expect(badge).toHaveClass('bg-amber-500/15')
    expect(badge).toHaveClass('text-amber-400')
  })

  it('renders all badges as grey/unknown when conditions is empty', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = makeResource({ status: { conditions: [] } })
    render(<ScaledObjectDetail resource={resource} />)
    expect(screen.getByTestId('badge-ready')).toHaveClass('text-slate-500')
    expect(screen.getByTestId('badge-active')).toHaveClass('text-slate-500')
    expect(screen.getByTestId('badge-paused')).toHaveClass('text-slate-500')
  })

  it('renders all badges as grey/unknown when status is absent', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = makeResource({ status: undefined })
    render(<ScaledObjectDetail resource={resource} />)
    expect(screen.getByTestId('badge-ready')).toHaveClass('text-slate-500')
  })
})

describe('ScaledObjectDetail — replica gauge', () => {
  it('shows min, current, and max replicas', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    render(<ScaledObjectDetail resource={makeResource()} />)
    expect(screen.getByTestId('replica-min').textContent).toBe('1')
    expect(screen.getByTestId('replica-current').textContent).toBe('3')
    expect(screen.getByTestId('replica-max').textContent).toBe('10')
  })

  it('shows "—" for current when status.currentReplicas is absent', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = makeResource({ status: { conditions: [] } }) // no currentReplicas
    render(<ScaledObjectDetail resource={resource} />)
    expect(screen.getByTestId('replica-current').textContent).toBe('—')
  })

  it('shows "—" for max when spec.maxReplicaCount is absent', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = {
      ...makeResource(),
      spec: { scaleTargetRef: { kind: 'Deployment', name: 'my-app' }, triggers: [] },
    }
    render(<ScaledObjectDetail resource={resource} />)
    expect(screen.getByTestId('replica-max').textContent).toBe('—')
  })

  it('shows 0 for min when spec.minReplicaCount is absent', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = {
      ...makeResource(),
      spec: { scaleTargetRef: { kind: 'Deployment', name: 'my-app' }, maxReplicaCount: 10, triggers: [] },
    }
    render(<ScaledObjectDetail resource={resource} />)
    expect(screen.getByTestId('replica-min').textContent).toBe('0')
  })
})

describe('ScaledObjectDetail — triggers table', () => {
  it('renders trigger type pill for each trigger', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    render(<ScaledObjectDetail resource={makeResource()} />)
    expect(screen.getByText('kafka')).toBeInTheDocument()
  })

  it('renders threshold from trigger.metadata.lagThreshold', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    render(<ScaledObjectDetail resource={makeResource()} />)
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('renders topic as identifier', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    render(<ScaledObjectDetail resource={makeResource()} />)
    expect(screen.getByText('orders')).toBeInTheDocument()
  })

  it('renders "—" threshold when no threshold/lagThreshold in metadata', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = makeResource({
      spec: {
        scaleTargetRef: { kind: 'Deployment', name: 'my-app' },
        triggers: [{ type: 'prometheus', metadata: { query: 'http_requests_total', serverAddress: 'http://prom:9090' } }],
      },
    })
    render(<ScaledObjectDetail resource={resource} />)
    const dashCells = screen.getAllByText('—')
    expect(dashCells.length).toBeGreaterThan(0)
  })

  it('shows empty triggers table message when triggers is empty', async () => {
    const { default: ScaledObjectDetail } = await import('./ScaledObjectDetail')
    const resource = makeResource({
      spec: { scaleTargetRef: { kind: 'Deployment', name: 'my-app' }, triggers: [] },
    })
    render(<ScaledObjectDetail resource={resource} />)
    expect(screen.getByText(/no triggers/i)).toBeInTheDocument()
  })
})
