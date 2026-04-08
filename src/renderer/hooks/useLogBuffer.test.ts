// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLogBuffer } from './useLogBuffer'

describe('useLogBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends items and enforces maxItems cap after flush', () => {
    const { result } = renderHook(() => useLogBuffer<number>({ maxItems: 3, flushIntervalMs: 100 }))

    act(() => {
      result.current.append([1, 2])
    })
    // Before timers run, nothing should be flushed
    expect(result.current.items).toEqual([])

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.items).toEqual([1, 2])

    act(() => {
      result.current.append([3, 4])
      vi.advanceTimersByTime(100)
    })
    // Max 3 items kept
    expect(result.current.items).toEqual([2, 3, 4])
  })

  it('reset clears both buffered and flushed items', () => {
    const { result } = renderHook(() => useLogBuffer<number>({ maxItems: 10, flushIntervalMs: 50 }))

    act(() => {
      result.current.append([1, 2, 3])
      vi.advanceTimersByTime(50)
    })
    expect(result.current.items.length).toBe(3)

    act(() => {
      result.current.reset()
    })
    expect(result.current.items).toEqual([])

    // Appending again after reset should work normally
    act(() => {
      result.current.append([4])
      vi.advanceTimersByTime(50)
    })
    expect(result.current.items).toEqual([4])
  })

  it('cancelFlush prevents pending items from being flushed', () => {
    const { result } = renderHook(() => useLogBuffer<number>({ maxItems: 10, flushIntervalMs: 100 }))

    act(() => {
      result.current.append([1, 2])
      // Cancel before the flush timer fires
      result.current.cancelFlush()
      vi.advanceTimersByTime(100)
    })

    // Items should not have been flushed
    expect(result.current.items).toEqual([])
  })

  it('append after cancelFlush re-schedules the flush timer, preserving the pending buffer', () => {
    const { result } = renderHook(() => useLogBuffer<number>({ maxItems: 10, flushIntervalMs: 100 }))

    act(() => {
      result.current.append([1])
      result.current.cancelFlush()
      vi.advanceTimersByTime(100)
    })
    // Nothing flushed yet — timer was cancelled
    expect(result.current.items).toEqual([])

    // cancelFlush keeps the pending buffer; append adds more and re-schedules
    act(() => {
      result.current.append([2])
      vi.advanceTimersByTime(100)
    })
    // Both items (1 from before cancel, 2 from after) are flushed together
    expect(result.current.items).toEqual([1, 2])
  })
})

