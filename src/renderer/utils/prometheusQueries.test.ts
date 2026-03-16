import { describe, it, expect } from 'vitest'
import {
    podCpuQuery, podMemoryQuery,
    nodeCpuQuery, nodeMemoryQuery,
    deploymentCpuQuery, deploymentMemoryQuery,
    presetToSeconds, defaultTimeRange,
} from './prometheusQueries'

describe('prometheusQueries', () => {
    describe('podCpuQuery', () => {
        it('embeds pod and namespace into query string', () => {
            const { query, label } = podCpuQuery('my-pod', 'my-ns')
            expect(query).toContain('my-pod')
            expect(query).toContain('my-ns')
            expect(label).toBe('CPU (m)')
        })
    })

    describe('podMemoryQuery', () => {
        it('embeds pod and namespace into query string', () => {
            const { query, label } = podMemoryQuery('my-pod', 'my-ns')
            expect(query).toContain('my-pod')
            expect(query).toContain('my-ns')
            expect(label).toBe('Memory (MiB)')
        })
    })

    describe('nodeCpuQuery', () => {
        it('embeds node name into query string', () => {
            const { query, label } = nodeCpuQuery('node-1')
            expect(query).toContain('node-1')
            expect(label).toBe('CPU (%)')
        })
    })

    describe('nodeMemoryQuery', () => {
        it('embeds node name into query string', () => {
            const { query, label } = nodeMemoryQuery('node-1')
            expect(query).toContain('node-1')
            expect(label).toBe('Memory (%)')
        })
    })

    describe('deploymentCpuQuery', () => {
        it('embeds deployment name and namespace', () => {
            const { query, label } = deploymentCpuQuery('nginx', 'production')
            expect(query).toContain('nginx')
            expect(query).toContain('production')
            expect(label).toBe('CPU (m)')
        })
    })

    describe('deploymentMemoryQuery', () => {
        it('embeds deployment name and namespace', () => {
            const { query, label } = deploymentMemoryQuery('nginx', 'production')
            expect(query).toContain('nginx')
            expect(query).toContain('production')
            expect(label).toBe('Memory (MiB)')
        })
    })

    describe('presetToSeconds', () => {
        it('converts 1h to 3600', () => { expect(presetToSeconds('1h')).toBe(3600) })
        it('converts 6h to 21600', () => { expect(presetToSeconds('6h')).toBe(21600) })
        it('converts 24h to 86400', () => { expect(presetToSeconds('24h')).toBe(86400) })
        it('converts 7d to 604800', () => { expect(presetToSeconds('7d')).toBe(604800) })
    })

    describe('defaultTimeRange', () => {
        it('returns a range ending at current time', () => {
            const before = Math.floor(Date.now() / 1000)
            const { start, end } = defaultTimeRange()
            const after = Math.floor(Date.now() / 1000)
            expect(end).toBeGreaterThanOrEqual(before)
            expect(end).toBeLessThanOrEqual(after)
            expect(end - start).toBe(3600)
        })
    })
})
