// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import UpdateBanner from './UpdateBanner'

expect.extend(matchers)

type Listener = (...args: any[]) => void

function makeUpdaterMock() {
  const listeners: Record<string, Listener[]> = {}
  const emit = (event: string, ...args: any[]) => {
    listeners[event]?.forEach((l) => l(...args))
  }
  const on = (event: string, cb: Listener) => {
    listeners[event] = [...(listeners[event] ?? []), cb]
    return () => { listeners[event] = listeners[event].filter((l) => l !== cb) }
  }
  return {
    mock: {
      onAvailable: (cb: Listener) => on('available', cb),
      onProgress: (cb: Listener) => on('progress', cb),
      onDownloaded: (cb: Listener) => on('downloaded', cb),
      onError: (cb: Listener) => on('error', cb),
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
    },
    emit,
  }
}

describe('UpdateBanner', () => {
  beforeEach(() => {
    delete (window as any).updater
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when no updater is present', () => {
    const { container } = render(<UpdateBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing in idle state', () => {
    const { mock } = makeUpdaterMock()
    ;(window as any).updater = mock
    const { container } = render(<UpdateBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('shows available banner with version when update fires', () => {
    const { mock, emit } = makeUpdaterMock()
    ;(window as any).updater = mock
    render(<UpdateBanner />)

    act(() => emit('available', { version: '3.0.0' }))

    expect(screen.getByText(/3\.0\.0 is available/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
  })

  it('shows progress bar without download button during download', () => {
    const { mock, emit } = makeUpdaterMock()
    ;(window as any).updater = mock
    render(<UpdateBanner />)

    act(() => emit('available', { version: '3.0.0' }))
    act(() => emit('progress', { percent: 42 }))

    expect(screen.getByText(/42%/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^download$/i })).toBeNull()
  })

  it('shows ready banner with restart button when download completes', () => {
    const { mock, emit } = makeUpdaterMock()
    ;(window as any).updater = mock
    render(<UpdateBanner />)

    act(() => emit('downloaded', { version: '3.0.0' }))

    expect(screen.getByText(/3\.0\.0 is ready to install/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument()
  })

  it('shows error banner when updater emits an error', () => {
    const { mock, emit } = makeUpdaterMock()
    ;(window as any).updater = mock
    render(<UpdateBanner />)

    act(() => emit('error', 'network timeout'))

    expect(screen.getByText(/network timeout/)).toBeInTheDocument()
  })

  it('dismiss hides the banner', () => {
    const { mock, emit } = makeUpdaterMock()
    ;(window as any).updater = mock
    render(<UpdateBanner />)

    act(() => emit('available', { version: '3.0.0' }))
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByText(/3\.0\.0 is available/)).toBeNull()
  })

  it('re-shows banner after dismiss when download completes', () => {
    const { mock, emit } = makeUpdaterMock()
    ;(window as any).updater = mock
    render(<UpdateBanner />)

    act(() => emit('available', { version: '3.0.0' }))
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/3\.0\.0 is available/)).toBeNull()

    act(() => emit('downloaded', { version: '3.0.0' }))
    expect(screen.getByText(/3\.0\.0 is ready to install/)).toBeInTheDocument()
  })

  it('cleans up all listeners on unmount', () => {
    const { mock, emit } = makeUpdaterMock()
    ;(window as any).updater = mock
    const { unmount } = render(<UpdateBanner />)

    unmount()

    expect(() => act(() => emit('available', { version: '99.0.0' }))).not.toThrow()
  })
})
