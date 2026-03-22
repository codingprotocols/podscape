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
  const isMounted = useRef(true)

  const kindSet = Array.isArray(kinds) ? kinds : [kinds]

  useEffect(() => {
    isMounted.current = true
    if (!ctx || !name) {
      setLoading(false)
      return
    }

    const fetchEvents = () => {
      setLoading(true)
      window.kubectl
        .getEvents(ctx, namespace ?? null)
        .then((all: KubeEvent[]) => {
          if (!isMounted.current) return
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
        .catch(() => { if (isMounted.current) setEvents([]) })
        .finally(() => { if (isMounted.current) setLoading(false) })
    }

    fetchEvents()

    if (!pollInterval) return () => { isMounted.current = false }

    const interval = setInterval(fetchEvents, pollInterval)
    return () => {
      isMounted.current = false
      clearInterval(interval)
    }
  }, [ctx, name, namespace, pollInterval])

  return { events, loading }
}
