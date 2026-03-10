import { KubeEvent, KubePod } from '../types'

export type TimelineItemType = 'success' | 'warning' | 'error' | 'info'

export interface TimelineItem {
    time: string
    title: string
    message: string
    type: TimelineItemType
    /** Number of times this event was deduplicated (undefined = single occurrence) */
    count?: number
    /** True when this entry reflects the current live state, not a historical event */
    isLive?: boolean
}

// The four pod conditions Kubernetes sets in lifecycle order
const CONDITION_LABEL: Record<string, string> = {
    PodScheduled:    'Pod Scheduled',
    Initialized:     'Initialized',
    ContainersReady: 'Containers Ready',
    Ready:           'Pod Ready',
}

const CONDITION_MESSAGE: Record<string, string> = {
    PodScheduled:    'Kubernetes scheduler placed the pod on a node.',
    Initialized:     'All init containers completed successfully.',
    ContainersReady: 'All containers passed their readiness checks.',
    Ready:           'Pod is ready to serve traffic.',
}

const TRACKED_CONDITIONS = new Set(['PodScheduled', 'Initialized', 'ContainersReady', 'Ready'])

/**
 * Build an ordered, deduplicated timeline for a pod.
 *
 * Stages covered:
 *  1. Pod Created               — metadata.creationTimestamp
 *  2. Pod Conditions            — PodScheduled → Initialized → ContainersReady → Ready
 *  3. Init container lifecycle  — started, completed, failed, crash history
 *  4. App container lifecycle   — started, current terminated, crash history
 *  5. Live waiting states       — CrashLoopBackOff / ImagePullBackOff (isLive: true)
 *  6. High restart count        — warning at restartCount >= 3
 *  7. Kubernetes events         — deduplicated by reason+message, count badge
 *
 * Live entries (isLive: true) always sort to the end regardless of their timestamp.
 */
export function buildTimelineItems(pod: KubePod, events: KubeEvent[]): TimelineItem[] {
    const items: TimelineItem[] = []
    const now = new Date().toISOString()

    // ── 1. Pod Created ──────────────────────────────────────────────────────
    items.push({
        time:    pod.metadata.creationTimestamp,
        title:   'Pod Created',
        message: 'Resource manifest accepted by API server.',
        type:    'info',
    })

    // ── 2. Pod Conditions ───────────────────────────────────────────────────
    for (const cond of pod.status.conditions ?? []) {
        if (cond.status !== 'True') continue
        if (!TRACKED_CONDITIONS.has(cond.type)) continue

        // PodScheduled duplicates our "Scheduled" entry — skip it here since
        // we derive that from spec.nodeName above (kept for backwards compat)
        if (cond.type === 'PodScheduled') continue

        items.push({
            time:    cond.lastTransitionTime ?? pod.metadata.creationTimestamp,
            title:   CONDITION_LABEL[cond.type],
            message: cond.message || CONDITION_MESSAGE[cond.type],
            type:    cond.type === 'Ready' ? 'success' : 'info',
        })
    }

    // ── 3. Scheduled (from spec, provides nodeName) ─────────────────────────
    if (pod.spec.nodeName) {
        items.push({
            time:    pod.status.startTime || pod.metadata.creationTimestamp,
            title:   'Scheduled',
            message: `Placed on node ${pod.spec.nodeName}.`,
            type:    'success',
        })
    }

    // ── 4. Init container lifecycle ─────────────────────────────────────────
    for (const is of pod.status.initContainerStatuses ?? []) {
        // Previous crash (lastState.terminated with non-zero exit)
        const lastTerm = is.lastState?.terminated
        if (lastTerm) {
            const reason   = lastTerm.reason ?? 'Terminated'
            const exitCode = lastTerm.exitCode ?? 0
            items.push({
                time:    lastTerm.finishedAt ?? pod.metadata.creationTimestamp,
                title:   `Init: ${is.name} crashed`,
                message: `${reason} — exit code ${exitCode}${lastTerm.message ? ` — ${lastTerm.message}` : ''}.`,
                type:    reason === 'OOMKilled' ? 'error' : 'warning',
            })
        }

        // Current state
        const { state } = is
        if (state.running?.startedAt) {
            items.push({
                time:    state.running.startedAt,
                title:   `Init: ${is.name} running`,
                message: 'Init container is currently running.',
                type:    'info',
            })
        } else if (state.terminated) {
            const { exitCode = 0, reason = 'Completed', finishedAt } = state.terminated
            items.push({
                time:    finishedAt ?? pod.metadata.creationTimestamp,
                title:   `Init: ${is.name} ${exitCode === 0 ? 'completed' : 'failed'}`,
                message: `${reason} — exit code ${exitCode}.`,
                type:    exitCode === 0 ? 'success' : 'error',
            })
        } else if (state.waiting?.reason) {
            items.push({
                time:    now,
                title:   `Init: ${is.name} — ${state.waiting.reason}`,
                message: state.waiting.message ?? `Init container is waiting: ${state.waiting.reason}.`,
                type:    'warning',
                isLive:  true,
            })
        }
    }

    // ── 5. App container lifecycle ──────────────────────────────────────────
    for (const cs of pod.status.containerStatuses ?? []) {
        // Previous crash history
        const lastTerm = cs.lastState?.terminated
        if (lastTerm) {
            const reason   = lastTerm.reason ?? 'Terminated'
            const exitCode = lastTerm.exitCode ?? 0
            items.push({
                time:    lastTerm.finishedAt ?? pod.metadata.creationTimestamp,
                title:   `${cs.name}: ${reason}`,
                message: `Container exited with code ${exitCode}${lastTerm.message ? ` — ${lastTerm.message}` : ''}.`,
                type:    reason === 'OOMKilled' ? 'error' : exitCode !== 0 ? 'warning' : 'info',
            })
        }

        // Currently running — record when the container started
        if (cs.state.running?.startedAt) {
            items.push({
                time:    cs.state.running.startedAt,
                title:   `${cs.name}: started`,
                message: 'Container is running.',
                type:    'success',
            })
        }

        // Currently terminated (e.g. completed job container)
        if (cs.state.terminated) {
            const { exitCode = 0, reason = 'Completed', finishedAt } = cs.state.terminated
            items.push({
                time:    finishedAt ?? pod.metadata.creationTimestamp,
                title:   `${cs.name}: ${exitCode === 0 ? 'completed' : reason}`,
                message: `Exited with code ${exitCode}.`,
                type:    exitCode === 0 ? 'success' : 'error',
            })
        }

        // Currently waiting — CrashLoopBackOff, ImagePullBackOff, etc. (live entry)
        if (cs.state.waiting?.reason) {
            items.push({
                time:    now,
                title:   `${cs.name}: ${cs.state.waiting.reason}`,
                message: cs.state.waiting.message ?? `Container is waiting: ${cs.state.waiting.reason}.`,
                type:    cs.state.waiting.reason === 'ContainerCreating' ? 'info' : 'error',
                isLive:  true,
            })
        }

        // High restart count warning
        if (cs.restartCount >= 3) {
            const anchor = cs.lastState?.terminated?.finishedAt
                ?? pod.status.startTime
                ?? pod.metadata.creationTimestamp
            items.push({
                time:    anchor,
                title:   `${cs.name}: unstable`,
                message: `Restarted ${cs.restartCount} times — container may be crashing repeatedly.`,
                type:    'warning',
            })
        }
    }

    // ── 6. Kubernetes events (deduplicated by reason+message) ───────────────
    const grouped = new Map<string, KubeEvent[]>()
    for (const e of events) {
        const key = `${e.reason ?? ''}::${e.message ?? ''}`
        const group = grouped.get(key)
        if (group) {
            group.push(e)
        } else {
            grouped.set(key, [e])
        }
    }

    for (const group of grouped.values()) {
        const representative = group.reduce((best, e) => {
            const bestTime = best.lastTimestamp || best.eventTime || best.metadata.creationTimestamp
            const eTime    = e.lastTimestamp    || e.eventTime    || e.metadata.creationTimestamp
            return new Date(eTime) > new Date(bestTime) ? e : best
        })

        const time       = representative.lastTimestamp || representative.eventTime || pod.metadata.creationTimestamp
        const totalCount = group.reduce((sum, e) => sum + (e.count ?? 1), 0)

        items.push({
            time,
            title:   representative.reason  || 'Event',
            message: representative.message || '',
            type:    representative.type === 'Warning' ? 'warning' : 'info',
            count:   totalCount > 1 ? totalCount : undefined,
        })
    }

    // Live entries pin to the bottom; historical entries sort ascending by time
    return items.sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? 1 : -1
        return new Date(a.time).getTime() - new Date(b.time).getTime()
    })
}
