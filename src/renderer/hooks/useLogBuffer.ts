import { useCallback, useRef, useState } from 'react'

interface UseLogBufferOptions {
  maxItems?: number
  flushIntervalMs?: number
}

interface UseLogBufferResult<T> {
  items: T[]
  append: (items: T[]) => void
  reset: () => void
  cancelFlush: () => void
}

export function useLogBuffer<T>({
  maxItems = 1000,
  flushIntervalMs = 100,
}: UseLogBufferOptions = {}): UseLogBufferResult<T> {
  const [items, setItems] = useState<T[]>([])
  const pendingBuffer = useRef<T[]>([])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPending = useCallback(() => {
    flushTimer.current = null
    if (pendingBuffer.current.length === 0) return
    const toFlush = pendingBuffer.current
    pendingBuffer.current = []
    setItems(prev => [...prev, ...toFlush].slice(-maxItems))
  }, [maxItems])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current === null) {
      flushTimer.current = setTimeout(flushPending, flushIntervalMs)
    }
  }, [flushPending, flushIntervalMs])

  const append = useCallback(
    (incoming: T[]) => {
      if (incoming.length === 0) return
      pendingBuffer.current.push(...incoming)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const reset = useCallback(() => {
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    pendingBuffer.current = []
    setItems([])
  }, [])

  const cancelFlush = useCallback(() => {
    // Intentionally does NOT clear pendingBuffer.
    // This only cancels the scheduled flush; buffered items are kept until `reset()`
    // (or until the next append schedules another flush).
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
  }, [])

  return { items, append, reset, cancelFlush }
}

