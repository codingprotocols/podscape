// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useAutoScroll } from './useAutoScroll'

function TestComponent() {
  const [scrollTrigger, setScrollTrigger] = React.useState(0)
  const { ref, autoScroll, setAutoScroll, handleScroll, scrollToBottom } = useAutoScroll<HTMLDivElement>({
    bottomThresholdPx: 60,
    ignoreProgrammaticMs: 50,
    scrollTrigger,
  })

  return (
    <div>
      <div
        ref={ref}
        data-testid="scroll"
        style={{ height: 100, overflow: 'auto' }}
        onScroll={handleScroll}
      >
        <div style={{ height: 500 }} />
      </div>
      <button data-testid="toggle" onClick={() => setAutoScroll(v => !v)}>
        toggle
      </button>
      <button data-testid="bumpTrigger" onClick={() => setScrollTrigger(v => v + 1)}>
        bumpTrigger
      </button>
      <button data-testid="scrollBottom" onClick={scrollToBottom}>
        bottom
      </button>
      <span data-testid="state">{autoScroll ? 'on' : 'off'}</span>
    </div>
  )
}

describe('useAutoScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('scrollToBottom moves the element to the bottom when autoScroll is enabled', () => {
    const { getByTestId } = render(<TestComponent />)
    const scrollEl = getByTestId('scroll') as HTMLDivElement

    Object.defineProperty(scrollEl, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollEl, 'clientHeight', { value: 100, configurable: true })

    // set an initial scroll position
    scrollEl.scrollTop = 0

    getByTestId('scrollBottom').click()
    // advance timers so ignore window elapses
    vi.advanceTimersByTime(60)

    expect(scrollEl.scrollTop).toBe(scrollEl.scrollHeight)
  })

  it('auto-scrolls when scrollTrigger changes while autoScroll is enabled', () => {
    const { getByTestId } = render(<TestComponent />)
    const scrollEl = getByTestId('scroll') as HTMLDivElement

    Object.defineProperty(scrollEl, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollEl, 'clientHeight', { value: 100, configurable: true })

    // Pick a near-bottom scrollTop so distanceFromBottom remains under threshold,
    // keeping autoScroll enabled even if jsdom fires onScroll on scrollTop writes.
    scrollEl.scrollTop = 350

    if (getByTestId('state').textContent === 'off') {
      fireEvent.click(getByTestId('toggle'))
    }

    fireEvent.click(getByTestId('bumpTrigger'))
    vi.advanceTimersByTime(60)

    expect(scrollEl.scrollTop).toBe(scrollEl.scrollHeight)
  })

  it('disables autoScroll when user scrolls far from bottom', () => {
    const { getByTestId } = render(<TestComponent />)
    const scrollEl = getByTestId('scroll') as HTMLDivElement

    Object.defineProperty(scrollEl, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(scrollEl, 'clientHeight', { value: 100, configurable: true })

    // simulate user scrolling near the top
    scrollEl.scrollTop = 0
    // Clear any in-flight ignore window triggered by programmatic scrolling.
    vi.advanceTimersByTime(60)
    fireEvent.scroll(scrollEl, { target: scrollEl })

    expect(getByTestId('state').textContent).toBe('off')
  })
})

