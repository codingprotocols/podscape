// @vitest-environment jsdom
/**
 * Isolated tests for the auto-scroll / ignoringScrollRef fix.
 *
 * Rather than loading the heavy PodDetail component, we reproduce the exact
 * same state + effect + onScroll logic in a minimal wrapper so the suite stays
 * fast and memory-safe.
 */
import React, { useEffect, useRef, useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// jsdom doesn't implement scroll layout — scrollTop is read-only by default.
// Make it writable so the auto-scroll effect (scrollTop = scrollHeight) doesn't throw.
Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
  configurable: true,
  get() { return (this as any)._scrollTop ?? 0 },
  set(v: number) { (this as any)._scrollTop = v },
})

afterEach(() => { cleanup(); vi.useRealTimers() })

// ── Minimal component that mirrors PodDetail's auto-scroll logic ──────────────

function AutoScrollLog({ lines }: { lines: string[] }) {
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLPreElement>(null)
  const ignoringScrollRef = useRef(false)

  // Exact copy of the effect in PodDetail
  useEffect(() => {
    if (!autoScroll) return
    ignoringScrollRef.current = true
    containerRef.current && (containerRef.current.scrollTop = containerRef.current.scrollHeight)
    setTimeout(() => { ignoringScrollRef.current = false }, 50)
  }, [lines, autoScroll])

  return (
    <div>
      <button onClick={() => setAutoScroll(v => !v)}>
        {autoScroll ? 'AUTO-SCROLL ON' : 'AUTO-SCROLL OFF'}
      </button>
      <pre
        ref={containerRef}
        data-testid="log"
        // Exact copy of the onScroll handler in PodDetail
        onScroll={e => {
          if (ignoringScrollRef.current) return
          const el = e.currentTarget
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  )
}

// Helper: set scroll position properties on the element
function setScrollPos(el: HTMLElement, scrollTop: number, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  el.scrollTop = scrollTop  // uses the writable prototype property defined above
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('auto-scroll toggle', () => {
  it('renders AUTO-SCROLL ON by default', () => {
    render(<AutoScrollLog lines={[]} />)
    expect(screen.getByText('AUTO-SCROLL ON')).toBeTruthy()
  })

  it('clicking the button switches to AUTO-SCROLL OFF', () => {
    render(<AutoScrollLog lines={[]} />)
    fireEvent.click(screen.getByText('AUTO-SCROLL ON'))
    expect(screen.getByText('AUTO-SCROLL OFF')).toBeTruthy()
  })

  it('clicking OFF then ON re-enables auto-scroll', () => {
    render(<AutoScrollLog lines={[]} />)
    fireEvent.click(screen.getByText('AUTO-SCROLL ON'))
    fireEvent.click(screen.getByText('AUTO-SCROLL OFF'))
    expect(screen.getByText('AUTO-SCROLL ON')).toBeTruthy()
  })
})

describe('onScroll handler', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('scrolling away from bottom disables auto-scroll (after ignore window)', () => {
    render(<AutoScrollLog lines={['line 1']} />)
    const pre = screen.getByTestId('log')

    vi.advanceTimersByTime(100) // expire ignoringScrollRef window
    setScrollPos(pre, 0, 1000, 200) // far from bottom
    fireEvent.scroll(pre)

    expect(screen.getByText('AUTO-SCROLL OFF')).toBeTruthy()
  })

  it('scrolling to the bottom re-enables auto-scroll', () => {
    render(<AutoScrollLog lines={['line 1']} />)
    fireEvent.click(screen.getByText('AUTO-SCROLL ON')) // turn off first

    const pre = screen.getByTestId('log')
    vi.advanceTimersByTime(100)
    setScrollPos(pre, 950, 1000, 60) // within 60 px of bottom
    fireEvent.scroll(pre)

    expect(screen.getByText('AUTO-SCROLL ON')).toBeTruthy()
  })
})

describe('ignoringScrollRef — programmatic scroll guard', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('scroll event within 50 ms of auto-scroll does NOT re-enable after OFF click', () => {
    const { rerender } = render(<AutoScrollLog lines={[]} />)

    // Deliver a new line → triggers effect → sets ignoringScrollRef = true
    act(() => { rerender(<AutoScrollLog lines={['new line']} />) })

    // User immediately clicks OFF
    fireEvent.click(screen.getByText('AUTO-SCROLL ON'))
    expect(screen.getByText('AUTO-SCROLL OFF')).toBeTruthy()

    // Scroll event arrives 30 ms later — still within the 50 ms ignore window
    const pre = screen.getByTestId('log')
    setScrollPos(pre, 950, 1000, 60) // at bottom → would normally re-enable
    vi.advanceTimersByTime(30)
    fireEvent.scroll(pre)

    // Must remain OFF — ignoringScrollRef blocked the handler
    expect(screen.getByText('AUTO-SCROLL OFF')).toBeTruthy()
  })

  it('scroll event after 50 ms DOES update auto-scroll normally', () => {
    const { rerender } = render(<AutoScrollLog lines={[]} />)

    act(() => { rerender(<AutoScrollLog lines={['new line']} />) })
    fireEvent.click(screen.getByText('AUTO-SCROLL ON')) // turn off

    const pre = screen.getByTestId('log')
    setScrollPos(pre, 950, 1000, 60)
    vi.advanceTimersByTime(51) // past the 50 ms window
    fireEvent.scroll(pre)

    // Now at bottom → re-enables
    expect(screen.getByText('AUTO-SCROLL ON')).toBeTruthy()
  })

  it('multiple new lines within the ignore window do not accumulate stale timers', () => {
    const { rerender } = render(<AutoScrollLog lines={[]} />)

    // Rapid-fire three renders → three effects → three setTimeout calls
    act(() => { rerender(<AutoScrollLog lines={['a']} />) })
    act(() => { rerender(<AutoScrollLog lines={['a', 'b']} />) })
    act(() => { rerender(<AutoScrollLog lines={['a', 'b', 'c']} />) })

    fireEvent.click(screen.getByText('AUTO-SCROLL ON'))

    const pre = screen.getByTestId('log')
    setScrollPos(pre, 950, 1000, 60)
    vi.advanceTimersByTime(30) // still inside the last effect's ignore window
    fireEvent.scroll(pre)

    expect(screen.getByText('AUTO-SCROLL OFF')).toBeTruthy()
  })
})
