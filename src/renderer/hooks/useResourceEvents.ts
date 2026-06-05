import { useState, useEffect, useRef } from 'react'
import type { KubeEvent } from '../types'

/**
 * Fetches and filters events for a specific Kubernetes resource.
 * Optionally polls on an interval (useful for resources like HPAs that
 * generate frequent scale events).
 *
 * @param ctx       - Active kubeconfig context; pass null to skip fetching
 * @param name      - Resource name to filter events for
 * @param kinds     - One or more involvedObject.kind values to match (e.g. 'DaemonSet' or ['HorizontalPodAutoscaler', 'HPA'])
 * @param namespace - Namespace to query; null / undefined for cluster-scoped
 * @param pollInterval - Optional ms interval to re-fetch; omit for one-shot
 */
export function useResourceEvents(
  ctx: string | null,
  name: string | null,
  kinds: string | string[],
  namespace: string | null | undefined,
  pollInterval?: number
): { events: KubeEvent[]; loading: boolean } {
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [loading, setLoading] = useState(true)

  const kindsKey = Array.isArray(kinds) ? kinds.join(',') : kinds

  useEffect(() => {
    const kindSet = kindsKey.split(',')
    if (!ctx || !name) {
      setLoading(false)
      return
    }
    // Local variable — each effect run gets its own `mounted`. Cleanup sets
    // it to false only for this run's closure, so in-flight promises from a
    // previous run cannot write stale data after deps change.
    let mounted = true

    const isFirstFetch = { current: true }

    const fetchEvents = () => {
      if (isFirstFetch.current) setLoading(true)
      window.kubectl
        .getEvents(ctx, namespace ?? null)
        .then((all: KubeEvent[]) => {
          if (!mounted) return
          const filtered = all
            .filter(e => e.involvedObject.name === name && kindSet.includes(e.involvedObject.kind))
            .sort((a, b) => {
              const ta = a.lastTimestamp ?? a.eventTime ?? a.firstTimestamp ?? ''
              const tb = b.lastTimestamp ?? b.eventTime ?? b.firstTimestamp ?? ''
              return tb.localeCompare(ta)
            })
            .slice(0, 15)
          setEvents(filtered)
        })
        .catch(() => { if (mounted) setEvents([]) })
        .finally(() => {
          isFirstFetch.current = false
          if (mounted) setLoading(false)
        })
    }

    fetchEvents()

    if (!pollInterval) return () => { mounted = false }

    const interval = setInterval(fetchEvents, pollInterval)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [ctx, name, namespace, pollInterval, kindsKey])

  return { events, loading }
}
