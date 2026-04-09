import { useCallback, useEffect, useRef, useState } from 'react'

interface UseAutoScrollOptions {
  bottomThresholdPx?: number
  ignoreProgrammaticMs?: number
  /**
   * Triggers the "scroll to bottom" effect when it changes while auto-scroll is enabled.
   * Consumers typically pass something like `logs.length` or a monotonically increasing counter.
   */
  scrollTrigger?: number
  /**
   * Controlled mode: when provided (along with `setAutoScroll`), this hook uses the provided
   * `autoScroll` state instead of internal state. Useful when multiple panes should share
   * a single toggle.
   */
  autoScroll?: boolean
  setAutoScroll?: React.Dispatch<React.SetStateAction<boolean>>
}

interface UseAutoScrollResult<T extends HTMLElement> {
  ref: React.RefObject<T>
  autoScroll: boolean
  setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>
  handleScroll: (event: React.UIEvent<T>) => void
  scrollToBottom: () => void
}

export function useAutoScroll<T extends HTMLElement>({
  bottomThresholdPx = 60,
  ignoreProgrammaticMs = 50,
  scrollTrigger = 0,
  autoScroll,
  setAutoScroll,
}: UseAutoScrollOptions = {}): UseAutoScrollResult<T> {
  const ref = useRef<T | null>(null)
  const ignoringScrollRef = useRef(false)
  const ignoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [internalAutoScroll, internalSetAutoScroll] = useState(true)
  const isControlled = autoScroll !== undefined && setAutoScroll !== undefined
  const effectiveAutoScroll = isControlled ? autoScroll : internalAutoScroll
  const effectiveSetAutoScroll = isControlled ? setAutoScroll : internalSetAutoScroll

  const scrollToBottom = useCallback(() => {
    if (!ref.current) return
    ignoringScrollRef.current = true
    ref.current.scrollTop = ref.current.scrollHeight
    if (ignoreTimeoutRef.current) clearTimeout(ignoreTimeoutRef.current)
    ignoreTimeoutRef.current = setTimeout(() => {
      ignoringScrollRef.current = false
      ignoreTimeoutRef.current = null
    }, ignoreProgrammaticMs)
  }, [ignoreProgrammaticMs])

  useEffect(() => {
    return () => {
      if (ignoreTimeoutRef.current) clearTimeout(ignoreTimeoutRef.current)
      ignoreTimeoutRef.current = null
    }
  }, [])

  const handleScroll = useCallback(
    (event: React.UIEvent<T>) => {
      if (ignoringScrollRef.current) return
      const el = event.currentTarget
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      effectiveSetAutoScroll(distanceFromBottom < bottomThresholdPx)
    },
    [bottomThresholdPx, effectiveSetAutoScroll],
  )

  useEffect(() => {
    if (effectiveAutoScroll) {
      scrollToBottom()
    }
  }, [effectiveAutoScroll, scrollTrigger, scrollToBottom])

  return { ref, autoScroll: effectiveAutoScroll, setAutoScroll: effectiveSetAutoScroll, handleScroll, scrollToBottom }
}

