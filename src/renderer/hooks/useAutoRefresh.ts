import { useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 30_000

/**
 * Polls `refresh` every 30 s while `enabled` is true, with two optimisations:
 *
 * 1. Skips the tick while the document is hidden (window minimised / tab backgrounded)
 *    so we don't burn CPU or network when the user isn't looking.
 * 2. Fires `refresh` immediately when the document becomes visible or the window
 *    regains focus, so stale data clears the instant the user returns rather than
 *    waiting up to 30 s for the next scheduled tick.
 */
export function useAutoRefresh(enabled: boolean, refresh: () => void): void {
  // Keep a stable ref so the effect never needs to restart because the refresh
  // function identity changed (e.g. on every render of the parent component).
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      if (!document.hidden) refreshRef.current()
    }

    const id = setInterval(tick, POLL_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (!document.hidden) refreshRef.current()
    }

    const onFocus = () => { if (!document.hidden) refreshRef.current() }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled])
}
