import { describe, it, expect } from 'vitest'
import { buildTimelineItems } from './buildTimelineItems'
import type { KubePod, KubeEvent } from '../types'

// Minimal pod factory — only fields used by buildTimelineItems
function makePod(overrides: Partial<KubePod> = {}): KubePod {
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
        },
        status: {
            phase: 'Running',
            containerStatuses: [],
        },
        ...overrides,
    } as unknown as KubePod
}

function makeEvent(overrides: Partial<KubeEvent> = {}): KubeEvent {
    return {
        metadata: { name: 'evt', namespace: 'default', uid: 'evt-uid', creationTimestamp: '2024-01-01T00:01:00Z', labels: {} },
        type: 'Normal',
        reason: 'Pulled',
        message: 'Successfully pulled image',
        lastTimestamp: '2024-01-01T00:01:00Z',
        count: 1,
        ...overrides,
    } as unknown as KubeEvent
}

describe('buildTimelineItems', () => {
    it('always starts with Pod Created', () => {
        const items = buildTimelineItems(makePod(), [])
        expect(items[0].title).toBe('Pod Created')
        expect(items[0].type).toBe('info')
    })

    it('includes Scheduled entry when nodeName is set', () => {
        const pod = makePod({ spec: { nodeName: 'node-1', containers: [] } } as any)
        const items = buildTimelineItems(pod, [])
        expect(items.some(i => i.title === 'Scheduled')).toBe(true)
    })

    it('does NOT include Scheduled entry when nodeName is absent', () => {
        const items = buildTimelineItems(makePod(), [])
        expect(items.some(i => i.title === 'Scheduled')).toBe(false)
    })

    it('items are sorted ascending by time', () => {
        const pod = makePod({ spec: { nodeName: 'node-1', containers: [] } } as any)
        const events = [
            makeEvent({ reason: 'Late', lastTimestamp: '2024-01-01T00:10:00Z' }),
            makeEvent({ reason: 'Early', lastTimestamp: '2024-01-01T00:02:00Z' }),
        ]
        const items = buildTimelineItems(pod, events)
        for (let i = 1; i < items.length; i++) {
            expect(new Date(items[i].time).getTime()).toBeGreaterThanOrEqual(new Date(items[i - 1].time).getTime())
        }
    })

    describe('event deduplication', () => {
        it('collapses events with identical reason+message into one entry', () => {
            const events = [
                makeEvent({ reason: 'BackOff', message: 'Back-off restarting failed container', count: 3, lastTimestamp: '2024-01-01T00:05:00Z' }),
                makeEvent({ reason: 'BackOff', message: 'Back-off restarting failed container', count: 2, lastTimestamp: '2024-01-01T00:10:00Z' }),
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
            const backoff = items.find(i => i.title === 'BackOff')!
            expect(backoff.time).toBe('2024-01-01T00:10:00Z')
        })

        it('keeps distinct reason+message events separate', () => {
            const events = [
                makeEvent({ reason: 'Pulled', message: 'image pulled', count: 1 }),
                makeEvent({ reason: 'Started', message: 'container started', count: 1 }),
            ]
            const items = buildTimelineItems(makePod(), events)
            expect(items.some(i => i.title === 'Pulled')).toBe(true)
            expect(items.some(i => i.title === 'Started')).toBe(true)
        })

        it('does not add count badge for single occurrences', () => {
            const events = [makeEvent({ count: 1 })]
            const items = buildTimelineItems(makePod(), events)
            const evt = items.find(i => i.title === 'Pulled')!
            expect(evt.count).toBeUndefined()
        })

        it('Warning events get warning type', () => {
            const events = [makeEvent({ type: 'Warning', reason: 'Failed', message: 'failed to pull image' })]
            const items = buildTimelineItems(makePod(), events)
            const failed = items.find(i => i.title === 'Failed')!
            expect(failed.type).toBe('warning')
        })
    })

    describe('container termination history', () => {
        it('includes OOMKilled termination as error', () => {
            const pod = makePod({
                status: {
                    phase: 'Running',
                    containerStatuses: [{
                        name: 'app',
                        ready: true,
                        restartCount: 1,
                        lastState: {
                            terminated: {
                                reason: 'OOMKilled',
                                exitCode: 137,
                                finishedAt: '2024-01-01T00:03:00Z',
                            }
                        }
                    }],
                } as any,
            })
            const items = buildTimelineItems(pod, [])
            const oom = items.find(i => i.title.includes('OOMKilled'))!
            expect(oom).toBeDefined()
            expect(oom.type).toBe('error')
            expect(oom.message).toContain('137')
        })

        it('includes non-zero exit code termination as warning', () => {
            const pod = makePod({
                status: {
                    phase: 'Running',
                    containerStatuses: [{
                        name: 'app',
                        ready: false,
                        restartCount: 1,
                        lastState: {
                            terminated: {
                                reason: 'Error',
                                exitCode: 1,
                                finishedAt: '2024-01-01T00:04:00Z',
                            }
                        }
                    }],
                } as any,
            })
            const items = buildTimelineItems(pod, [])
            const err = items.find(i => i.title.includes('Error'))!
            expect(err).toBeDefined()
            expect(err.type).toBe('warning')
        })

        it('skips containers with no lastState.terminated', () => {
            const pod = makePod({
                status: {
                    phase: 'Running',
                    containerStatuses: [{ name: 'app', ready: true, restartCount: 0, lastState: {} }],
                } as any,
            })
            const items = buildTimelineItems(pod, [])
            // Only Pod Created (no node → no Scheduled)
            expect(items).toHaveLength(1)
        })
    })
})
