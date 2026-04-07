// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
expect.extend(matchers)

// Stub heavy dependencies
vi.mock('lucide-react', () => ({ Activity: () => null, FileCode: () => null, X: () => null, ChevronRight: () => null }))
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <pre data-testid="editor">{value}</pre>,
  DiffEditor: () => null,
}))
vi.mock('./YAMLViewer', () => ({
  default: ({ content }: { content: string }) => <pre data-testid="yaml-viewer">{content}</pre>,
}))

const mockGetYAML = vi.fn()
const mockApplyYAML = vi.fn()
const mockRefresh = vi.fn()

beforeEach(() => {
  mockGetYAML.mockResolvedValue('apiVersion: v1\nkind: VirtualService')
  mockApplyYAML.mockResolvedValue('')

  vi.doMock('../../store', () => ({
    useAppStore: (sel?: (s: any) => any) => {
      const state = {
        theme: 'dark',
        isProduction: false,
        selectedContext: 'test-ctx',
        getYAML: mockGetYAML,
        applyYAML: mockApplyYAML,
        refresh: mockRefresh,
      }
      return sel ? sel(state) : state
    },
  }))

  // Only patch window.kubectl without overwriting window
  if (!('kubectl' in window)) {
    Object.defineProperty(window, 'kubectl', { value: {}, writable: true, configurable: true })
  }
  ;(window as any).kubectl = { getYAML: mockGetYAML }
})

afterEach(() => { cleanup(); vi.resetModules() })

const mockItem = {
  apiVersion: 'networking.istio.io/v1beta1',
  kind: 'VirtualService',
  metadata: {
    name: 'my-vs',
    namespace: 'default',
    creationTimestamp: '2024-01-01T00:00:00Z',
    labels: { app: 'my-app' },
  },
  spec: { hosts: ['my-svc'] },
}

describe('GenericCRDDetail', () => {
  it('renders resource name in header', async () => {
    const { GenericCRDDetail } = await import('./GenericCRDDetail')
    render(
      <GenericCRDDetail
        item={mockItem as any}
        context="test-ctx"
        namespace="default"
        crdName="virtualservices.networking.istio.io"
      />
    )
    expect(screen.getAllByText('my-vs').length).toBeGreaterThan(0)
  })

  it('shows Metadata tab by default', async () => {
    const { GenericCRDDetail } = await import('./GenericCRDDetail')
    render(
      <GenericCRDDetail
        item={mockItem as any}
        context="test-ctx"
        namespace="default"
        crdName="virtualservices.networking.istio.io"
      />
    )
    expect(screen.getByText('Metadata')).toBeInTheDocument()
    // namespace and kind appear in the header
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('VirtualService')).toBeInTheDocument()
  })

  it('renders labels on Metadata tab', async () => {
    const { GenericCRDDetail } = await import('./GenericCRDDetail')
    render(
      <GenericCRDDetail
        item={mockItem as any}
        context="test-ctx"
        namespace="default"
        crdName="virtualservices.networking.istio.io"
      />
    )
    expect(screen.getByText('app=my-app')).toBeInTheDocument()
  })

  it('switches to Spec tab and renders spec as YAML', async () => {
    const { GenericCRDDetail } = await import('./GenericCRDDetail')
    render(
      <GenericCRDDetail
        item={mockItem as any}
        context="test-ctx"
        namespace="default"
        crdName="virtualservices.networking.istio.io"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /spec/i }))
    // js-yaml mock serialises as JSON, so spec content appears in the pre block
    expect(screen.getByText(/my-svc/)).toBeInTheDocument()
  })

  it('shows error when YAML fetch fails', async () => {
    mockGetYAML.mockRejectedValueOnce(new Error('RBAC denied'))
    const { GenericCRDDetail } = await import('./GenericCRDDetail')
    render(
      <GenericCRDDetail
        item={mockItem as any}
        context="test-ctx"
        namespace="default"
        crdName="virtualservices.networking.istio.io"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /yaml/i }))
    await waitFor(() =>
      expect(screen.getByText('RBAC denied')).toBeInTheDocument()
    )
  })

  it('fetches and renders YAML when YAML Edit tab is clicked', async () => {
    const { GenericCRDDetail } = await import('./GenericCRDDetail')
    render(
      <GenericCRDDetail
        item={mockItem as any}
        context="test-ctx"
        namespace="default"
        crdName="virtualservices.networking.istio.io"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /yaml/i }))
    await waitFor(() =>
      expect(mockGetYAML).toHaveBeenCalledWith('test-ctx', 'default', 'virtualservices.networking.istio.io', 'my-vs')
    )
    await waitFor(() =>
      expect(screen.getByTestId('yaml-viewer')).toBeInTheDocument()
    )
    expect(screen.getByTestId('yaml-viewer').textContent).toContain('apiVersion: v1')
  })
})
