import { describe, it, expect } from 'vitest'
import { buildTimelineItems } from './buildTimelineItems'
import type { KubePod, KubeEvent } from '../types'

// ─── Factories ────────────────────────────────────────────────────────────────

function makePod(overrides: Record<string, unknown> = {}): KubePod {
    return {
        metadata: {
            name: 'test-pod',
            namespace: 'default',
            uid: 'uid-1',
            creationTimestamp: '2024-01-01T00:00:00Z',
            labels: {},
        },
        spec: {
            nodeName: undefined,
            containers: [],
            initContainers: [],
        },
        status: {
            phase: 'Running',
            conditions: [],
            containerStatuses: [],
            initContainerStatuses: [],
        },
        ...overrides,
    } as unknown as KubePod
}

function makeEvent(overrides: Partial<KubeEvent> = {}): KubeEvent {
    return {
        metadata: {
            name: 'evt',
            namespace: 'default',
            uid: 'evt-uid',
            creationTimestamp: '2024-01-01T00:01:00Z',
            labels: {},
        },
        type: 'Normal',
        reason: 'Pulled',
        message: 'Successfully pulled image',
        lastTimestamp: '2024-01-01T00:01:00Z',
        count: 1,
        ...overrides,
    } as unknown as KubeEvent
}

function makeCondition(type: string, lastTransitionTime: string, message?: string) {
    return { type, status: 'True', lastTransitionTime, message }
}

function makeContainerStatus(name: string, overrides: Record<string, unknown> = {}) {
    return {
        name,
        ready: true,
        restartCount: 0,
        image: 'app:1.0',
        imageID: '',
        state: {},
        lastState: {},
        ...overrides,
    }
}

// ─── Baseline ─────────────────────────────────────────────────────────────────

describe('buildTimelineItems — baseline', () => {
    it('always starts with Pod Created', () => {
        const items = buildTimelineItems(makePod(), [])
        expect(items[0].title).toBe('Pod Created')
        expect(items[0].type).toBe('info')
        expect(items[0].isLive).toBeUndefined()
    })

    it('includes Scheduled entry when nodeName is set', () => {
        const pod = makePod({ spec: { nodeName: 'node-1', containers: [] } })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'Scheduled')).toBe(true)
    })

    it('omits Scheduled entry when nodeName is absent', () => {
        const items = buildTimelineItems(makePod(), [])
        expect(items.some(i => i.title === 'Scheduled')).toBe(false)
    })

    it('historical items are sorted ascending by time', () => {
        const pod = makePod({ spec: { nodeName: 'node-1', containers: [] } })
        const events = [
            makeEvent({ reason: 'Late',  lastTimestamp: '2024-01-01T00:10:00Z' }),
            makeEvent({ reason: 'Early', lastTimestamp: '2024-01-01T00:02:00Z' }),
        ]
        const items = buildTimelineItems(pod as KubePod, events).filter(i => !i.isLive)
        for (let i = 1; i < items.length; i++) {
            expect(new Date(items[i].time).getTime()).toBeGreaterThanOrEqual(
                new Date(items[i - 1].time).getTime()
            )
        }
    })

    it('live entries always sort after historical entries', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        state: { waiting: { reason: 'CrashLoopBackOff' } },
                        restartCount: 5,
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const liveIndex = items.findIndex(i => i.isLive)
        const lastHistoricalIndex = items.reduce((max, item, idx) => (!item.isLive ? idx : max), -1)
        expect(liveIndex).toBeGreaterThan(lastHistoricalIndex)
    })
})

// ─── Pod Conditions ───────────────────────────────────────────────────────────

describe('buildTimelineItems — pod conditions', () => {
    it('adds Initialized, ContainersReady, Ready conditions when status is True', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [
                    makeCondition('Initialized',     '2024-01-01T00:01:00Z'),
                    makeCondition('ContainersReady', '2024-01-01T00:02:00Z'),
                    makeCondition('Ready',           '2024-01-01T00:03:00Z'),
                ],
                containerStatuses: [],
                initContainerStatuses: [],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'Initialized')).toBe(true)
        expect(items.some(i => i.title === 'Containers Ready')).toBe(true)
        expect(items.some(i => i.title === 'Pod Ready')).toBe(true)
    })

    it('Ready condition gets success type', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [makeCondition('Ready', '2024-01-01T00:03:00Z')],
                containerStatuses: [],
                initContainerStatuses: [],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const ready = items.find(i => i.title === 'Pod Ready')!
        expect(ready.type).toBe('success')
    })

    it('skips conditions whose status is not True', () => {
        const pod = makePod({
            status: {
                phase: 'Pending',
                conditions: [
                    { type: 'Ready', status: 'False', lastTransitionTime: '2024-01-01T00:01:00Z' },
                ],
                containerStatuses: [],
                initContainerStatuses: [],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'Pod Ready')).toBe(false)
    })

    it('skips unknown/custom condition types', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [makeCondition('CustomCondition', '2024-01-01T00:01:00Z')],
                containerStatuses: [],
                initContainerStatuses: [],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'CustomCondition')).toBe(false)
    })

    it('does not add a duplicate PodScheduled entry from conditions (already covered by Scheduled)', () => {
        const pod = makePod({
            spec: { nodeName: 'node-1', containers: [] },
            status: {
                phase: 'Running',
                startTime: '2024-01-01T00:00:30Z',
                conditions: [makeCondition('PodScheduled', '2024-01-01T00:00:30Z')],
                containerStatuses: [],
                initContainerStatuses: [],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const scheduledCount = items.filter(i => i.title === 'Pod Scheduled' || i.title === 'Scheduled').length
        expect(scheduledCount).toBe(1)
    })
})

// ─── Init Containers ──────────────────────────────────────────────────────────

describe('buildTimelineItems — init containers', () => {
    it('adds a completed init container entry', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                containerStatuses: [],
                initContainerStatuses: [
                    makeContainerStatus('init-db', {
                        state: {
                            terminated: { exitCode: 0, reason: 'Completed', finishedAt: '2024-01-01T00:01:00Z' },
                        },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const init = items.find(i => i.title === 'Init: init-db completed')!
        expect(init).toBeDefined()
        expect(init.type).toBe('success')
    })

    it('adds a failed init container entry as error', () => {
        const pod = makePod({
            status: {
                phase: 'Pending',
                conditions: [],
                containerStatuses: [],
                initContainerStatuses: [
                    makeContainerStatus('init-migrate', {
                        state: {
                            terminated: { exitCode: 1, reason: 'Error', finishedAt: '2024-01-01T00:01:00Z' },
                        },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const init = items.find(i => i.title === 'Init: init-migrate failed')!
        expect(init).toBeDefined()
        expect(init.type).toBe('error')
    })

    it('adds a running init container entry (not live)', () => {
        const pod = makePod({
            status: {
                phase: 'Pending',
                conditions: [],
                containerStatuses: [],
                initContainerStatuses: [
                    makeContainerStatus('init-setup', {
                        state: { running: { startedAt: '2024-01-01T00:00:30Z' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const init = items.find(i => i.title === 'Init: init-setup running')!
        expect(init).toBeDefined()
        expect(init.time).toBe('2024-01-01T00:00:30Z')
        expect(init.isLive).toBeUndefined()
    })

    it('adds a waiting init container as a live entry', () => {
        const pod = makePod({
            status: {
                phase: 'Pending',
                conditions: [],
                containerStatuses: [],
                initContainerStatuses: [
                    makeContainerStatus('init-wait', {
                        state: { waiting: { reason: 'PodInitializing', message: 'waiting for deps' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const init = items.find(i => i.title.startsWith('Init: init-wait'))!
        expect(init).toBeDefined()
        expect(init.isLive).toBe(true)
    })

    it('includes crash history from lastState.terminated for init containers', () => {
        const pod = makePod({
            status: {
                phase: 'Pending',
                conditions: [],
                containerStatuses: [],
                initContainerStatuses: [
                    makeContainerStatus('init-retry', {
                        lastState: {
                            terminated: { exitCode: 1, reason: 'Error', finishedAt: '2024-01-01T00:00:45Z' },
                        },
                        state: { waiting: { reason: 'CrashLoopBackOff' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'Init: init-retry crashed')).toBe(true)
    })
})

// ─── App Container Lifecycle ──────────────────────────────────────────────────

describe('buildTimelineItems — app container started', () => {
    it('adds one entry per running container with its startedAt time', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        state: { running: { startedAt: '2024-01-01T00:02:00Z' } },
                    }),
                    makeContainerStatus('sidecar', {
                        state: { running: { startedAt: '2024-01-01T00:02:05Z' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'app: started')).toBe(true)
        expect(items.some(i => i.title === 'sidecar: started')).toBe(true)
        expect(items.find(i => i.title === 'app: started')!.type).toBe('success')
    })

    it('adds a terminated entry for a completed container', () => {
        const pod = makePod({
            status: {
                phase: 'Succeeded',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('job', {
                        ready: false,
                        state: {
                            terminated: { exitCode: 0, reason: 'Completed', finishedAt: '2024-01-01T00:05:00Z' },
                        },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'job: completed')).toBe(true)
        expect(items.find(i => i.title === 'job: completed')!.type).toBe('success')
    })

    it('adds an error entry for a non-zero terminated container', () => {
        const pod = makePod({
            status: {
                phase: 'Failed',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        ready: false,
                        state: {
                            terminated: { exitCode: 137, reason: 'OOMKilled', finishedAt: '2024-01-01T00:05:00Z' },
                        },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'app: OOMKilled')).toBe(true)
        expect(items.find(i => i.title === 'app: OOMKilled')!.type).toBe('error')
    })
})

// ─── Live Waiting State ───────────────────────────────────────────────────────

describe('buildTimelineItems — live waiting states', () => {
    it('adds a live entry for CrashLoopBackOff', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m0s' } },
                        restartCount: 4,
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const live = items.find(i => i.isLive && i.title.includes('CrashLoopBackOff'))!
        expect(live).toBeDefined()
        expect(live.type).toBe('error')
    })

    it('adds a live entry for ImagePullBackOff', () => {
        const pod = makePod({
            status: {
                phase: 'Pending',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        state: { waiting: { reason: 'ImagePullBackOff' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.isLive && i.title.includes('ImagePullBackOff'))).toBe(true)
    })

    it('ContainerCreating gets info type (not error)', () => {
        const pod = makePod({
            status: {
                phase: 'Pending',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        state: { waiting: { reason: 'ContainerCreating' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const entry = items.find(i => i.isLive && i.title.includes('ContainerCreating'))!
        expect(entry.type).toBe('info')
    })

    it('live entry has no timestamp shown in the title (isLive flag set)', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        state: { waiting: { reason: 'CrashLoopBackOff' } },
                        restartCount: 5,
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const live = items.find(i => i.isLive)!
        expect(live.isLive).toBe(true)
    })
})

// ─── High Restart Count ───────────────────────────────────────────────────────

describe('buildTimelineItems — restart count warning', () => {
    it('does not warn when restartCount is 2 (below threshold)', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        restartCount: 2,
                        state: { running: { startedAt: '2024-01-01T00:02:00Z' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        expect(items.some(i => i.title === 'app: unstable')).toBe(false)
    })

    it('warns when restartCount is exactly 3 (at threshold)', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        restartCount: 3,
                        state: { running: { startedAt: '2024-01-01T00:02:00Z' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const warn = items.find(i => i.title === 'app: unstable')!
        expect(warn).toBeDefined()
        expect(warn.type).toBe('warning')
        expect(warn.message).toContain('3')
    })

    it('warns for high restart counts above threshold', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        restartCount: 47,
                        state: { running: { startedAt: '2024-01-01T00:02:00Z' } },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const warn = items.find(i => i.title === 'app: unstable')!
        expect(warn).toBeDefined()
        expect(warn.message).toContain('47')
    })

    it('uses lastState.terminated.finishedAt as anchor time when available', () => {
        const pod = makePod({
            status: {
                phase: 'Running',
                conditions: [],
                initContainerStatuses: [],
                containerStatuses: [
                    makeContainerStatus('app', {
                        restartCount: 5,
                        state: { running: { startedAt: '2024-01-01T00:05:00Z' } },
                        lastState: {
                            terminated: { exitCode: 1, reason: 'Error', finishedAt: '2024-01-01T00:04:55Z' },
                        },
                    }),
                ],
            },
        })
        const items = buildTimelineItems(pod as KubePod, [])
        const warn = items.find(i => i.title === 'app: unstable')!
        expect(warn.time).toBe('2024-01-01T00:04:55Z')
    })
})

// ─── Event Deduplication (regression) ────────────────────────────────────────

describe('buildTimelineItems — event deduplication', () => {
    it('collapses events with identical reason+message into one entry', () => {
        const events = [
            makeEvent({ reason: 'BackOff', message: 'back-off restarting', count: 3, lastTimestamp: '2024-01-01T00:05:00Z' }),
            makeEvent({ reason: 'BackOff', message: 'back-off restarting', count: 2, lastTimestamp: '2024-01-01T00:10:00Z' }),
        ]
        const items = buildTimelineItems(makePod(), events)
        const backoffs = items.filter(i => i.title === 'BackOff')
        expect(backoffs).toHaveLength(1)
        expect(backoffs[0].count).toBe(5)
    })

    it('uses the most recent timestamp for deduplicated entries', () => {
        const events = [
            makeEvent({ reason: 'BackOff', message: 'msg', lastTimestamp: '2024-01-01T00:05:00Z', count: 1 }),
            makeEvent({ reason: 'BackOff', message: 'msg', lastTimestamp: '2024-01-01T00:10:00Z', count: 1 }),
        ]
        const items = buildTimelineItems(makePod(), events)
        expect(items.find(i => i.title === 'BackOff')!.time).toBe('2024-01-01T00:10:00Z')
    })

    it('does not set count for single-occurrence events', () => {
        const items = buildTimelineItems(makePod(), [makeEvent({ count: 1 })])
        expect(items.find(i => i.title === 'Pulled')!.count).toBeUndefined()
    })

    it('Warning events get warning type', () => {
        const items = buildTimelineItems(makePod(), [
            makeEvent({ type: 'Warning', reason: 'Failed', message: 'failed to pull' }),
        ])
        expect(items.find(i => i.title === 'Failed')!.type).toBe('warning')
    })
})
