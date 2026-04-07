// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
expect.extend(matchers)

import { SpecTree } from './SpecTree'

// Stub lucide-react ChevronRight to avoid SVG rendering issues
vi.mock('lucide-react', () => ({ ChevronRight: () => null }))

afterEach(() => cleanup())

describe('SpecTree', () => {
  it('renders primitive string values', () => {
    render(<SpecTree data={{ image: 'nginx:latest' }} />)
    expect(screen.getByText('image')).toBeInTheDocument()
    expect(screen.getByText('nginx:latest')).toBeInTheDocument()
  })

  it('renders primitive number values', () => {
    render(<SpecTree data={{ replicas: 3 }} />)
    expect(screen.getByText('replicas')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders nested object keys', () => {
    render(<SpecTree data={{ spec: { host: 'my-svc' } }} />)
    expect(screen.getByText('spec')).toBeInTheDocument()
  })

  it('renders arrays with count label', () => {
    render(<SpecTree data={{ ports: [80, 443] }} />)
    expect(screen.getByText('ports')).toBeInTheDocument()
    // The collapsed array shows [2]
    expect(screen.getByText('[2]')).toBeInTheDocument()
  })

  it('renders null as em-dash', () => {
    render(<SpecTree data={{ value: null }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders boolean values', () => {
    const data: Record<string, unknown> = { enabled: true }
    render(<SpecTree data={data} />)
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('returns dash for non-object data', () => {
    render(<SpecTree data={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('expands nested object when toggle button is clicked', () => {
    render(<SpecTree data={{ spec: { host: 'my-svc' } }} />)
    // Nested value is collapsed by default (depth > 0)
    expect(screen.queryByText('host')).not.toBeInTheDocument()
    // Click the collapse toggle button (shows count label)
    fireEvent.click(screen.getByText('{1}'))
    expect(screen.getByText('host')).toBeInTheDocument()
    expect(screen.getByText('my-svc')).toBeInTheDocument()
  })

  it('collapses expanded node when toggle is clicked again', () => {
    render(<SpecTree data={{ spec: { host: 'my-svc' } }} />)
    const toggle = screen.getByText('{1}')
    fireEvent.click(toggle)
    expect(screen.getByText('host')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('host')).not.toBeInTheDocument()
  })

  it('renders [...] sentinel at MAX_DEPTH instead of recursing', () => {
    // Pass depth=19 so ValueNode receives depth=20 (MAX_DEPTH), triggering the sentinel
    render(<SpecTree data={{ key: { nested: 'value' } }} depth={19} />)
    expect(screen.getByText('[...]')).toBeInTheDocument()
  })
})
