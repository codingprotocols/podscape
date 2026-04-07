// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
expect.extend(matchers)

vi.mock('lucide-react', () => ({ Database: () => null, Activity: () => null, ChevronRight: () => null }))
const capturedDetailProps: any[] = []
vi.mock('./GenericCRDDetail', () => ({
  GenericCRDDetail: (props: any) => {
    capturedDetailProps.push(props)
    return <div data-testid="generic-detail">{props.item?.metadata?.name}</div>
  },
}))
vi.mock('../../hooks/useDragResize', () => ({
  useDragResize: () => ({ width: 380, onMouseDown: vi.fn() }),
}))
vi.mock('../../types', () => ({
  formatAge: (ts?: string) => ts ? '1d' : '—',
}))

const mockGetCustomResource = vi.fn()

beforeEach(() => {
  ;(window as any).kubectl = { getCustomResource: mockGetCustomResource }
  capturedDetailProps.length = 0
})

afterEach(() => { cleanup(); vi.resetModules() })

const mockItems = [
  {
    metadata: { name: 'vs-one', namespace: 'default', uid: 'a1', creationTimestamp: '2024-01-01T00:00:00Z' },
    kind: 'VirtualService',
    spec: { hosts: ['svc-a'] },
  },
  {
    metadata: { name: 'vs-two', namespace: 'default', uid: 'b2', creationTimestamp: '2024-02-01T00:00:00Z' },
    kind: 'VirtualService',
    spec: { hosts: ['svc-b'] },
  },
]

describe('GenericCRDPanel', () => {
  it('fetches and renders instance list', async () => {
    mockGetCustomResource.mockResolvedValue(mockItems)
    const { GenericCRDPanel } = await import('./GenericCRDPanel')
    render(<GenericCRDPanel crdName="virtualservices.networking.istio.io" context="test-ctx" namespace="default" />)
    await waitFor(() => expect(screen.getByText('vs-one')).toBeInTheDocument())
    expect(screen.getByText('vs-two')).toBeInTheDocument()
  })

  it('shows detail pane when item is selected', async () => {
    mockGetCustomResource.mockResolvedValue(mockItems)
    const { GenericCRDPanel } = await import('./GenericCRDPanel')
    render(<GenericCRDPanel crdName="virtualservices.networking.istio.io" context="test-ctx" namespace="default" />)
    await waitFor(() => screen.getByText('vs-one'))
    fireEvent.click(screen.getByText('vs-one'))
    expect(screen.getByTestId('generic-detail')).toBeInTheDocument()
    expect(screen.getByText('vs-one', { selector: '[data-testid="generic-detail"]' })).toBeInTheDocument()
  })

  it('shows empty state when no instances', async () => {
    mockGetCustomResource.mockResolvedValue([])
    const { GenericCRDPanel } = await import('./GenericCRDPanel')
    render(<GenericCRDPanel crdName="virtualservices.networking.istio.io" context="test-ctx" namespace="default" />)
    await waitFor(() => expect(screen.getByText(/no resource instances/i)).toBeInTheDocument())
  })

  it('shows error state on fetch failure', async () => {
    mockGetCustomResource.mockRejectedValue(new Error('not found'))
    const { GenericCRDPanel } = await import('./GenericCRDPanel')
    render(<GenericCRDPanel crdName="bad.crd" context="test-ctx" namespace="default" />)
    await waitFor(() => expect(screen.getByText('not found')).toBeInTheDocument())
  })

  it('passes correct props to GenericCRDDetail on selection', async () => {
    mockGetCustomResource.mockResolvedValue(mockItems)
    const { GenericCRDPanel } = await import('./GenericCRDPanel')
    render(<GenericCRDPanel crdName="virtualservices.networking.istio.io" context="test-ctx" namespace="default" />)
    await waitFor(() => screen.getByText('vs-one'))
    fireEvent.click(screen.getByText('vs-one'))
    expect(capturedDetailProps.length).toBeGreaterThan(0)
    const props = capturedDetailProps[capturedDetailProps.length - 1]
    expect(props.context).toBe('test-ctx')
    expect(props.crdName).toBe('virtualservices.networking.istio.io')
    expect(props.item?.metadata?.name).toBe('vs-one')
  })

  it('calls onCountLoaded with item count after fetch', async () => {
    mockGetCustomResource.mockResolvedValue(mockItems)
    const onCountLoaded = vi.fn()
    const { GenericCRDPanel } = await import('./GenericCRDPanel')
    render(<GenericCRDPanel crdName="virtualservices.networking.istio.io" context="test-ctx" namespace="default" onCountLoaded={onCountLoaded} />)
    await waitFor(() => expect(onCountLoaded).toHaveBeenCalledWith(2))
  })

  it('deselects item when clicked again', async () => {
    mockGetCustomResource.mockResolvedValue(mockItems)
    const { GenericCRDPanel } = await import('./GenericCRDPanel')
    render(<GenericCRDPanel crdName="virtualservices.networking.istio.io" context="test-ctx" namespace="default" />)
    const row = await waitFor(() => screen.getByText('vs-one').closest('tr')!)
    fireEvent.click(row)
    expect(screen.getByTestId('generic-detail')).toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.queryByTestId('generic-detail')).not.toBeInTheDocument()
  })
})
