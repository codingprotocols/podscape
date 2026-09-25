// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { GenericResourceDetail } from './GenericResourceDetail'

expect.extend(matchers)

vi.mock('../../hooks/useYAMLEditor', () => ({
  useYAMLEditor: () => ({
    yaml: null, loading: false, error: null,
    open: vi.fn(), apply: vi.fn(), close: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
})

const resource = {
  apiVersion: 'admissionregistration.k8s.io/v1',
  kind: 'MutatingWebhookConfiguration',
  metadata: {
    name: 'my-webhook',
    uid: 'abc-123',
    creationTimestamp: '2026-01-01T00:00:00Z',
    labels: { team: 'platform' },
  },
  webhooks: [{ name: 'validate.example.com' }],
} as any

describe('GenericResourceDetail', () => {
  it('renders the resource name and kind', () => {
    render(<GenericResourceDetail resource={resource} kind="mutatingwebhookconfiguration" clusterScoped />)
    // Name legitimately appears twice — once in the header, once in the Overview "Name" row.
    expect(screen.getAllByText('my-webhook').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('MutatingWebhookConfiguration')).toBeInTheDocument()
  })

  it('renders top-level non-metadata fields as JSON in the spec tab', () => {
    render(<GenericResourceDetail resource={resource} kind="mutatingwebhookconfiguration" clusterScoped />)
    expect(screen.getByText(/validate\.example\.com/)).toBeInTheDocument()
  })

  it('renders labels from metadata', () => {
    render(<GenericResourceDetail resource={resource} kind="mutatingwebhookconfiguration" clusterScoped />)
    expect(screen.getByText('team=platform')).toBeInTheDocument()
  })
})
