// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)
import DeploymentDetail from './DeploymentDetail'
import type { KubeDeployment } from '../../../types'

// ── store mock ─────────────────────────────────────────────────────────────────
vi.mock('../../../store', () => ({
  useAppStore: (sel?: (s: any) => any) => {
    const state = {
      rolloutRestart: vi.fn().mockResolvedValue('ok'),
      selectedContext: 'test-ctx',
      selectedNamespace: 'default',
      scanResource: vi.fn(),
      scanResults: {},
      isScanning: false,
      prometheusAvailable: false,
    }
    return sel ? sel(state) : state
  },
}))

// ── heavy sub-component stubs ──────────────────────────────────────────────────
vi.mock('../../advanced/OwnerChain', () => ({ default: () => null }))
vi.mock('../../advanced/AnalysisView', () => ({ default: () => null }))
vi.mock('../../advanced/TimeSeriesChart', () => ({
  default: () => null,
  PrometheusTimeRangeBar: () => null,
}))
vi.mock('../../common/YAMLViewer', () => ({ default: () => null }))
vi.mock('../../../hooks/useYAMLEditor', () => ({
  useYAMLEditor: () => ({
    yaml: null, loading: false, error: null,
    open: vi.fn(), apply: vi.fn(), close: vi.fn(),
  }),
}))

// ── window.kubectl mock ────────────────────────────────────────────────────────
const mockRolloutHistory = vi.fn()
const mockRolloutUndo = vi.fn()
const mockGetResourceEvents = vi.fn().mockResolvedValue([])

beforeEach(() => {
  mockRolloutHistory.mockReset()
  mockRolloutUndo.mockReset()
  ;(window as any).kubectl = {
    rolloutHistory: mockRolloutHistory,
    rolloutUndo: mockRolloutUndo,
    getResourceEvents: mockGetResourceEvents,
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── fixture ────────────────────────────────────────────────────────────────────
function makeDeployment(overrides: Partial<KubeDeployment> = {}): KubeDeployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'web',
      namespace: 'default',
      uid: 'uid-web',
      creationTimestamp: new Date().toISOString(),
      annotations: { 'deployment.kubernetes.io/revision': '3' },
    },
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: 'web' } },
      template: { metadata: {}, spec: { containers: [{ name: 'app', image: 'nginx:v3' }] } },
      strategy: { type: 'RollingUpdate' },
    },
    status: {
      replicas: 3,
      readyReplicas: 3,
      availableReplicas: 3,
      updatedReplicas: 3,
      conditions: [],
    },
    ...overrides,
  } as KubeDeployment
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('DeploymentDetail — overview tab', () => {
  it('renders deployment name and namespace', () => {
    render(<DeploymentDetail deployment={makeDeployment()} />)
    expect(screen.getByText('web')).toBeTruthy()
    expect(screen.getByText(/default.*deployment/i)).toBeTruthy()
  })

  it('shows ready badge matching replica counts', () => {
    render(<DeploymentDetail deployment={makeDeployment()} />)
    expect(screen.getByText('3/3 READY')).toBeTruthy()
  })

  it('shows amber badge when not all replicas ready', () => {
    render(<DeploymentDetail deployment={makeDeployment({
      status: { replicas: 3, readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1, conditions: [] }
    })} />)
    expect(screen.getByText('1/3 READY')).toBeTruthy()
  })
})

describe('DeploymentDetail — history tab', () => {
  it('loads and renders revision table on tab switch', async () => {
    mockRolloutHistory.mockResolvedValue([
      { revision: 3, current: true,  age: '2d', images: ['nginx:v3'], desired: 3, ready: 3 },
      { revision: 2, current: false, age: '5d', images: ['nginx:v2'], desired: 3, ready: 0 },
    ])

    render(<DeploymentDetail deployment={makeDeployment()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /history/i })[0])

    await waitFor(() => {
      expect(screen.getByText('#3')).toBeTruthy()
      expect(screen.getByText('#2')).toBeTruthy()
    })
    expect(screen.getByText('Current')).toBeTruthy()
    expect(screen.getByText('nginx:v3')).toBeTruthy()
  })

  it('shows error message when history fetch fails', async () => {
    mockRolloutHistory.mockRejectedValue(new Error('forbidden'))

    render(<DeploymentDetail deployment={makeDeployment()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /history/i })[0])

    await waitFor(() => {
      expect(screen.getByText('forbidden')).toBeTruthy()
    })
  })

  it('shows empty state when no revisions returned', async () => {
    mockRolloutHistory.mockResolvedValue([])

    render(<DeploymentDetail deployment={makeDeployment()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /history/i })[0])

    await waitFor(() => {
      expect(screen.queryByText(/#\d/)).toBeNull()
    })
  })

  it('calls rolloutUndo with correct args on Rollback click', async () => {
    mockRolloutHistory.mockResolvedValue([
      { revision: 3, current: true,  age: '2d', images: ['nginx:v3'], desired: 3, ready: 3 },
      { revision: 2, current: false, age: '5d', images: ['nginx:v2'], desired: 3, ready: 0 },
    ])
    mockRolloutUndo.mockResolvedValue('ok')
    mockRolloutHistory.mockResolvedValueOnce([
      { revision: 3, current: true,  age: '2d', images: ['nginx:v3'], desired: 3, ready: 3 },
      { revision: 2, current: false, age: '5d', images: ['nginx:v2'], desired: 3, ready: 0 },
    ]).mockResolvedValue([
      { revision: 3, current: true, age: '2d', images: ['nginx:v3'], desired: 3, ready: 3 },
    ])

    render(<DeploymentDetail deployment={makeDeployment()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /history/i })[0])

    await waitFor(() => screen.getByText('#2'))

    // Click the Rollback button on revision 2 (Previous row)
    const rollbackBtns = screen.getAllByRole('button', { name: /rollback/i })
    fireEvent.click(rollbackBtns[0])

    await waitFor(() => {
      expect(mockRolloutUndo).toHaveBeenCalledWith('test-ctx', 'default', 'deployment', 'web', 2)
    })
  })

  it('shows error when rolloutHistory re-fetch fails after successful undo', async () => {
    mockRolloutHistory
      .mockResolvedValueOnce([
        { revision: 3, current: true, age: '2d', images: ['nginx:v3'], desired: 3, ready: 3 },
        { revision: 2, current: false, age: '5d', images: ['nginx:v2'], desired: 3, ready: 0 },
      ])
      .mockRejectedValue(new Error('forbidden after undo'))
    mockRolloutUndo.mockResolvedValue('ok')

    render(<DeploymentDetail deployment={makeDeployment()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /history/i })[0])
    await waitFor(() => screen.getByText('#2'))

    fireEvent.click(screen.getAllByRole('button', { name: /rollback/i })[0])

    await waitFor(() => {
      expect(screen.getByText('forbidden after undo')).toBeTruthy()
    })
  })
})
