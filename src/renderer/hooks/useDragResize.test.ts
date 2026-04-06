// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { useDragResize } from './useDragResize'

describe('useDragResize', () => {
  it('initialises with default width', () => {
    const { result } = renderHook(() => useDragResize(380, 280, 600))
    expect(result.current.width).toBe(380)
  })

  it('exposes onMouseDown handler', () => {
    const { result } = renderHook(() => useDragResize(380, 280, 600))
    expect(typeof result.current.onMouseDown).toBe('function')
  })

  it('clamps width to min/max on drag', () => {
    const { result } = renderHook(() => useDragResize(380, 280, 600))
    act(() => {
      result.current.onMouseDown({ preventDefault: vi.fn(), clientX: 500 } as unknown as React.MouseEvent)
      // Dragging far right reduces delta → we go left from 500 to 0, delta = 500, clamped to 600
      const moveEvent = new MouseEvent('mousemove', { clientX: 0 })
      window.dispatchEvent(moveEvent)
    })
    expect(result.current.width).toBeLessThanOrEqual(600)
    expect(result.current.width).toBeGreaterThanOrEqual(280)
  })

  it('cleans up event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { result, unmount } = renderHook(() => useDragResize(380, 280, 600))
    // Start a drag so listeners are registered
    act(() => {
      result.current.onMouseDown({ preventDefault: vi.fn(), clientX: 400 } as unknown as React.MouseEvent)
    })
    unmount()
    expect(removeSpy).toHaveBeenCalled()
    removeSpy.mockRestore()
  })
})
