// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoRefresh } from './useAutoRefresh'

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call refresh when disabled', () => {
    const refresh = vi.fn()
    renderHook(() => useAutoRefresh(false, refresh))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('calls refresh after 30 s when enabled', () => {
    const refresh = vi.fn()
    renderHook(() => useAutoRefresh(true, refresh))
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('calls refresh on each 30 s tick', () => {
    const refresh = vi.fn()
    renderHook(() => useAutoRefresh(true, refresh))
    act(() => { vi.advanceTimersByTime(90_000) })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('skips tick when document is hidden', () => {
    const refresh = vi.fn()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    renderHook(() => useAutoRefresh(true, refresh))
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes immediately when document becomes visible', () => {
    const refresh = vi.fn()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    renderHook(() => useAutoRefresh(true, refresh))

    // Simulate tab becoming visible
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes immediately on window focus', () => {
    const refresh = vi.fn()
    renderHook(() => useAutoRefresh(true, refresh))

    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('clears interval and listeners on unmount', () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useAutoRefresh(true, refresh))
    unmount()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('uses the latest refresh reference without restarting the effect', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ fn }) => useAutoRefresh(true, fn),
      { initialProps: { fn: first } }
    )
    // Swap the callback — effect must NOT restart (no interval reset)
    rerender({ fn: second })
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('stops polling when enabled flips to false', () => {
    const refresh = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) => useAutoRefresh(enabled, refresh),
      { initialProps: { enabled: true } }
    )
    rerender({ enabled: false })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(refresh).not.toHaveBeenCalled()
  })
})
