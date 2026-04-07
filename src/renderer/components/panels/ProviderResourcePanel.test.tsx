// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
expect.extend(matchers)

// ── Static mocks (hoisted, module-level) ────────────────────────────────────
vi.mock('lucide-react', () => ({
  RefreshCw: () => null,
  X: () => null,
  ChevronRight: () => null,
  Activity: () => null,
}))
vi.mock('../../hooks/useDragResize', () => ({
  useDragResize: () => ({ width: 380, onMouseDown: vi.fn() }),
}))
vi.mock('../common/GenericCRDDetail', () => ({
  GenericCRDDetail: ({ item }: { item: any }) => (
    <div data-testid="generic-detail">{item?.metadata?.name}</div>
  ),
}))
vi.mock('../core/PageHeader', () => ({
  default: ({ title, subtitle, children }: any) => (
    <div>
      <span data-testid="header-title">{title}</span>
      <span data-testid="header-subtitle">{subtitle}</span>
      {children}
    </div>
  ),
}))
vi.mock('../../types', () => ({
  formatAge: (ts?: string) => ts ? '2d' : '—',
}))

// ── Helpers ──────────────────────────────────────────────────────────────────
const mockGetCustomResource = vi.fn()

function mockStore(overrides: Record<string, any> = {}) {
  vi.doMock('../../store', () => ({
    useAppStore: (sel?: (s: any) => any) => {
      const state = {
        selectedContext: 'test-ctx',
        selectedNamespace: 'default',
        providers: { traefikVersion: 'v3' },
        ...overrides,
      }
      return sel ? sel(state) : state
    },
  }))
}

const mockItems = [
  {
    metadata: { name: 'vs-alpha', namespace: 'default', uid: 'u1', creationTimestamp: '2024-01-01T00:00:00Z' },
    kind: 'VirtualService',
    spec: { http: [{}], tcp: [{}] },   // 2 routes total
  },
  {
    metadata: { name: 'vs-beta', namespace: 'istio-system', uid: 'u2', creationTimestamp: '2024-02-01T00:00:00Z' },
    kind: 'VirtualService',
    spec: { http: [], tcp: [] },
  },
]

beforeEach(() => {
  mockGetCustomResource.mockClear()
  ;(window as any).kubectl = { getCustomResource: mockGetCustomResource }
  mockGetCustomResource.mockResolvedValue(mockItems)
})

afterEach(() => { cleanup(); vi.resetModules() })

// ── List behaviour ───────────────────────────────────────────────────────────
describe('ProviderResourcePanel — list', () => {
  it('shows loading spinner while fetching', async () => {
    mockGetCustomResource.mockReturnValue(new Promise(() => {})) // never resolves
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    // Spinner text includes the section label
    expect(screen.getByText(/loading virtual services/i)).toBeInTheDocument()
  })

  it('renders item names after load', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => expect(screen.getByText('vs-alpha')).toBeInTheDocument())
    expect(screen.getByText('vs-beta')).toBeInTheDocument()
  })

  it('renders namespace column when selectedNamespace is _all', async () => {
    mockStore({ selectedNamespace: '_all' })
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => expect(screen.getByText('vs-alpha')).toBeInTheDocument())
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('istio-system')).toBeInTheDocument()
  })

  it('renders Age column using formatAge', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => screen.getByText('vs-alpha'))
    // formatAge mock returns '2d' for any non-empty timestamp
    const ageCells = screen.getAllByText('2d')
    expect(ageCells.length).toBe(2)
  })

  it('shows empty state when no items returned', async () => {
    mockGetCustomResource.mockResolvedValue([])
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => expect(screen.getByText(/no virtual services found/i)).toBeInTheDocument())
  })

  it('shows "in any namespace" text when namespace is _all', async () => {
    mockGetCustomResource.mockResolvedValue([])
    mockStore({ selectedNamespace: '_all' })
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => expect(screen.getByText(/in any namespace/i)).toBeInTheDocument())
  })

  it('shows error message on fetch failure', async () => {
    mockGetCustomResource.mockRejectedValue(new Error('rbac denied'))
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => expect(screen.getByText('rbac denied')).toBeInTheDocument())
  })

  it('shows correct section label in header', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="traefik-ingressroutes" />)
    await waitFor(() => screen.getByTestId('header-title'))
    expect(screen.getByTestId('header-title').textContent).toBe('Ingress Routes')
  })

  it('shows "all namespaces" subtitle when namespace is _all', async () => {
    mockStore({ selectedNamespace: '_all' })
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => screen.getByTestId('header-subtitle'))
    expect(screen.getByTestId('header-subtitle').textContent).toBe('all namespaces')
  })
})

// ── Summary column ────────────────────────────────────────────────────────────
describe('ProviderResourcePanel — summary column', () => {
  it('shows Summary column for istio-virtualservices', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => screen.getByText('vs-alpha'))
    expect(screen.getByText('Summary')).toBeInTheDocument()
  })

  it('renders route count for istio-virtualservices (2 routes)', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => screen.getByText('vs-alpha'))
    expect(screen.getByText('2 routes')).toBeInTheDocument()
  })

  it('renders "—" summary for istio-virtualservices with no routes', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => screen.getByText('vs-beta'))
    // vs-beta has 0 routes → itemSummary returns '—'
    const dashCells = screen.getAllByText('—')
    expect(dashCells.length).toBeGreaterThan(0)
  })

  it('renders host for istio-destinationrules', async () => {
    mockGetCustomResource.mockResolvedValue([{
      metadata: { name: 'dr-one', namespace: 'default', uid: 'x1', creationTimestamp: '2024-01-01T00:00:00Z' },
      kind: 'DestinationRule',
      spec: { host: 'my-service' },
    }])
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-destinationrules" />)
    await waitFor(() => screen.getByText('dr-one'))
    expect(screen.getByText('my-service')).toBeInTheDocument()
  })

  it('renders mTLS mode for istio-peerauth', async () => {
    mockGetCustomResource.mockResolvedValue([{
      metadata: { name: 'pa-one', namespace: 'default', uid: 'y1', creationTimestamp: '2024-01-01T00:00:00Z' },
      kind: 'PeerAuthentication',
      spec: { mtls: { mode: 'STRICT' } },
    }])
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-peerauth" />)
    await waitFor(() => screen.getByText('pa-one'))
    expect(screen.getByText('STRICT')).toBeInTheDocument()
  })

  it('renders route count for traefik-ingressroutes', async () => {
    mockGetCustomResource.mockResolvedValue([{
      metadata: { name: 'ir-one', namespace: 'default', uid: 'z1', creationTimestamp: '2024-01-01T00:00:00Z' },
      kind: 'IngressRoute',
      spec: { routes: [{}, {}] },
    }])
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="traefik-ingressroutes" />)
    await waitFor(() => screen.getByText('ir-one'))
    expect(screen.getByText('2 routes')).toBeInTheDocument()
  })

  it('renders middleware type for traefik-middlewares', async () => {
    mockGetCustomResource.mockResolvedValue([{
      metadata: { name: 'mw-one', namespace: 'default', uid: 'w1', creationTimestamp: '2024-01-01T00:00:00Z' },
      kind: 'Middleware',
      spec: { rateLimit: { average: 100 } },
    }])
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="traefik-middlewares" />)
    await waitFor(() => screen.getByText('mw-one'))
    expect(screen.getByText('Rate Limit')).toBeInTheDocument()
  })

  it('renders host for nginx-virtualservers', async () => {
    mockGetCustomResource.mockResolvedValue([{
      metadata: { name: 'nvs-one', namespace: 'default', uid: 'v1', creationTimestamp: '2024-01-01T00:00:00Z' },
      kind: 'VirtualServer',
      spec: { host: 'app.example.com' },
    }])
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="nginx-virtualservers" />)
    await waitFor(() => screen.getByText('nvs-one'))
    expect(screen.getByText('app.example.com')).toBeInTheDocument()
  })
})

// ── Row selection & detail pane ───────────────────────────────────────────────
describe('ProviderResourcePanel — row selection', () => {
  it('opens detail pane when a row is clicked', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => screen.getByText('vs-alpha'))
    fireEvent.click(screen.getByText('vs-alpha'))
    expect(screen.getByTestId('generic-detail')).toBeInTheDocument()
    expect(screen.getByTestId('generic-detail').textContent).toBe('vs-alpha')
  })

  it('closes detail pane when same row is clicked again', async () => {
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    const row = await waitFor(() => screen.getByText('vs-alpha').closest('tr')!)
    fireEvent.click(row)
    expect(screen.getByTestId('generic-detail')).toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.queryByTestId('generic-detail')).not.toBeInTheDocument()
  })

  it('closes detail pane when X button is clicked', async () => {
    // X renders as null but the close button still fires onClick
    mockStore()
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="istio-virtualservices" />)
    await waitFor(() => screen.getByText('vs-alpha'))
    fireEvent.click(screen.getByText('vs-alpha'))
    expect(screen.getByTestId('generic-detail')).toBeInTheDocument()
    // Find the close button by its onClick handler (title attribute)
    const closeBtn = document.querySelector('button[title="Close"]')
    expect(closeBtn).not.toBeNull()
    fireEvent.click(closeBtn!)
    expect(screen.queryByTestId('generic-detail')).not.toBeInTheDocument()
  })
})

// ── Traefik v2 CRD group fallback ─────────────────────────────────────────────
describe('ProviderResourcePanel — Traefik v2 group fallback', () => {
  it('uses traefik.containo.us group when traefikVersion is v2', async () => {
    mockStore({ providers: { traefikVersion: 'v2' } })
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="traefik-ingressroutes" />)
    await waitFor(() => expect(mockGetCustomResource).toHaveBeenCalled())
    const [, , crdArg] = mockGetCustomResource.mock.calls[0]
    expect(crdArg).toBe('ingressroutes.traefik.containo.us')
  })

  it('uses traefik.io group when traefikVersion is v3', async () => {
    mockStore({ providers: { traefikVersion: 'v3' } })
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="traefik-ingressroutes" />)
    await waitFor(() => expect(mockGetCustomResource).toHaveBeenCalled())
    const [, , crdArg] = mockGetCustomResource.mock.calls[0]
    expect(crdArg).toBe('ingressroutes.traefik.io')
  })

  it('leaves CRD name unchanged when traefikVersion is undefined', async () => {
    // Providers not yet detected — should not rewrite the CRD group
    mockStore({ providers: { traefikVersion: undefined } })
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="traefik-ingressroutes" />)
    await waitFor(() => expect(mockGetCustomResource).toHaveBeenCalled())
    const [, , crdArg] = mockGetCustomResource.mock.calls[0]
    expect(crdArg).toBe('ingressroutes.traefik.io')
  })

  it('leaves CRD name unchanged when traefikVersion is an unexpected value', async () => {
    mockStore({ providers: { traefikVersion: 'v4' } })
    const { default: Panel } = await import('./ProviderResourcePanel')
    render(<Panel section="traefik-ingressroutes" />)
    await waitFor(() => expect(mockGetCustomResource).toHaveBeenCalled())
    const [, , crdArg] = mockGetCustomResource.mock.calls[0]
    expect(crdArg).toBe('ingressroutes.traefik.io')
  })
})
