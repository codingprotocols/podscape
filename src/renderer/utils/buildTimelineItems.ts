import { KubeEvent, KubePod } from '../types'

export type TimelineItemType = 'success' | 'warning' | 'error' | 'info'

export interface TimelineItem {
    time: string
    title: string
    message: string
    type: TimelineItemType
    /** Number of times this item was deduplicated (undefined or 1 = single occurrence) */
    count?: number
}

/**
 * Build an ordered, deduplicated timeline for a pod.
 *
 * Deduplication: events sharing the same reason+message are collapsed
 * into a single entry with a `count` badge showing how many occurrences exist.
 * The most-recent timestamp for the group is used.
 *
 * Container termination state (OOMKilled, Error, etc.) from
 * `pod.status.containerStatuses[].lastState.terminated` is also included.
 */
export function buildTimelineItems(pod: KubePod, events: KubeEvent[]): TimelineItem[] {
    const items: TimelineItem[] = []

    // 1. Creation
    items.push({
        time: pod.metadata.creationTimestamp,
        title: 'Pod Created',
        message: 'Resource manifest accepted by API server.',
        type: 'info',
    })

    // 2. Scheduled
    if (pod.spec.nodeName) {
        items.push({
            time: pod.status.startTime || pod.metadata.creationTimestamp,
            title: 'Scheduled',
            message: `Placed on node ${pod.spec.nodeName}.`,
            type: 'success',
        })
    }

    // 3. Container termination history (OOMKilled, Error, etc.)
    for (const cs of pod.status.containerStatuses ?? []) {
        const terminated = cs.lastState?.terminated
        if (!terminated) continue

        const reason = terminated.reason ?? 'Terminated'
        const exitCode = terminated.exitCode ?? 0
        const finishedAt = terminated.finishedAt ?? pod.metadata.creationTimestamp

        items.push({
            time: finishedAt,
            title: `${cs.name}: ${reason}`,
            message: `Container exited with code ${exitCode}${terminated.message ? ` — ${terminated.message}` : ''}.`,
            type: reason === 'OOMKilled' ? 'error' : exitCode !== 0 ? 'warning' : 'info',
        })
    }

    // 4. Events — group by reason+message to deduplicate
    const grouped = new Map<string, { items: KubeEvent[] }>()
    for (const e of events) {
        const key = `${e.reason ?? ''}::${e.message ?? ''}`
        const group = grouped.get(key)
        if (group) {
            group.items.push(e)
        } else {
            grouped.set(key, { items: [e] })
        }
    }

    for (const { items: group } of grouped.values()) {
        // Pick the event with the latest timestamp as the representative
        const representative = group.reduce((best, e) => {
            const bestTime = best.lastTimestamp || best.eventTime || best.metadata.creationTimestamp
            const eTime = e.lastTimestamp || e.eventTime || e.metadata.creationTimestamp
            return new Date(eTime) > new Date(bestTime) ? e : best
        })

        const time = representative.lastTimestamp || representative.eventTime || pod.metadata.creationTimestamp
        const totalCount = group.reduce((sum, e) => sum + (e.count ?? 1), 0)

        items.push({
            time,
            title: representative.reason || 'Event',
            message: representative.message || '',
            type: representative.type === 'Warning' ? 'warning' : 'info',
            count: totalCount > 1 ? totalCount : undefined,
        })
    }

    // Sort ascending by time
    return items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}
